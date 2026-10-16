'use strict';
// Same-server chat. Every client of a server holds the same token, so the server has one shared room.
// Messages live in memory only (last 200, 24 h) and are delivered in real time by long polling:
//   GET  /api/chat?after=<id>&wait=<seconds>   -> { messages: [{id,name,text,at}], last }
//   POST /api/chat  { name, text }              -> the stored message
const MAX_LOG = 200;
const TTL = 24 * 3600e3;
const WAIT_MAX = 25;
const MAX_WAITERS = 200;
const NAME_MAX = 32;
const TEXT_MAX = 2000;
const RATE_N = 20, RATE_WINDOW = 10e3; // posts per client address

let seq = 0;
const log = [];
const waiters = new Set();
const rate = new Map();

function prune(now = Date.now()) {
  while (log.length && (log.length > MAX_LOG || now - log[0].at > TTL)) log.shift();
}

function since(after) {
  prune();
  return log.filter((m) => m.id > after);
}

function wake() {
  for (const w of [...waiters]) {
    const msgs = since(w.after);
    if (msgs.length) w.done(msgs);
  }
}

/** GET handler. [h] carries the router's reply helpers. */
function get(req, res, url, h) {
  const q = url.searchParams;
  const afterRaw = q.get('after');
  const after = afterRaw !== null && /^\d+$/.test(afterRaw) ? Number(afterRaw) : null;
  const wait = Math.min(WAIT_MAX, Math.max(0, Number(q.get('wait')) || 0));
  // First call (no cursor): the recent history so a new client has context.
  if (after === null) {
    prune();
    return h.sendJson(req, res, 200, { messages: log.slice(-50), last: seq });
  }
  const msgs = since(after);
  if (msgs.length || !wait || waiters.size >= MAX_WAITERS) return h.sendJson(req, res, 200, { messages: msgs, last: seq });
  const w = {
    after,
    done(list) {
      clearTimeout(timer);
      waiters.delete(w);
      h.sendJson(req, res, 200, { messages: list, last: seq });
    },
  };
  const timer = setTimeout(() => w.done([]), wait * 1000);
  waiters.add(w);
  res.on('close', () => { clearTimeout(timer); waiters.delete(w); });
}

function allowed(ip) {
  const now = Date.now();
  const r = rate.get(ip);
  if (!r || now - r.start > RATE_WINDOW) { rate.set(ip, { start: now, n: 1 }); if (rate.size > 5000) rate.clear(); return true; }
  return ++r.n <= RATE_N;
}

/** POST handler: validates, stores and wakes every waiting poll. */
async function post(req, res, ip, h) {
  if (!allowed(ip)) return h.sendText(req, res, 429, 'slow down', { 'Retry-After': '10' });
  let b;
  try { b = JSON.parse((await h.readBody(req, 8 * 1024)).toString('utf8')); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
  const text = typeof b?.text === 'string' ? b.text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, TEXT_MAX) : '';
  const name = clean(b?.name, NAME_MAX) || 'Anonymous';
  if (!text) return h.sendText(req, res, 400, 'empty message');
  const msg = { id: ++seq, name, text, at: Date.now() };
  log.push(msg);
  prune();
  wake();
  h.sendJson(req, res, 200, msg);
}

/** Test hook. */
function reset() { seq = 0; log.length = 0; rate.clear(); for (const w of [...waiters]) w.done([]); }

module.exports = { get, post, reset };
