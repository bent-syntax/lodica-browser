'use strict';
// Same-server chat. Every client of a server holds the same token, so the server has one shared room.
// Messages live in memory only (last 200, 24 h) and are delivered in real time by long polling:
//   GET  /api/chat?after=<id>&wait=<seconds>&room=<room>  -> { messages: [{id,name,text,at,room}], last }
//   POST /api/chat  { name, text, room }                  -> the stored message
//   GET  /api/chat/users?name=<me>                        -> {users: [{name, at}]}; a name given counts as presence
//   GET  /api/chat/rooms                                  -> [{room, at, count}] for the non-default rooms
// A room is just a label: "" is the shared server room, "dm:<a>|<b>" a private chat between two device
// names and "grp:<name>" a group. Rooms separate conversations; they are not access control, because every
// device of a server holds the same token.
const chatfile = require('./chatfile');
const MAX_LOG = 200;
const TTL = 24 * 3600e3;
const WAIT_MAX = 25;
const MAX_WAITERS = 200;
const NAME_MAX = 32;
const TEXT_MAX = 2000;
const ROOM_RE = /^(dm:[^|\s]{1,32}\|[^|\s]{1,32}|grp:[\w .-]{1,32})$/;
const RATE_N = 20, RATE_WINDOW = 10e3; // posts per client address

let seq = 0;
const log = [];
const waiters = new Set();
const rate = new Map();
const seen = new Map(); // device name -> last time it was seen in chat
const SEEN_TTL = 7 * 24 * 3600e3;

function touch(name) {
  seen.set(name, Date.now());
  if (seen.size > 500) { const old = [...seen].sort((a, b) => a[1] - b[1])[0]; seen.delete(old[0]); }
}

function prune(now = Date.now()) {
  while (log.length && (log.length > MAX_LOG || now - log[0].at > TTL)) log.shift();
}

function cleanRoom(v) {
  return typeof v === 'string' && ROOM_RE.test(v) ? v : '';
}

function since(after, room = '') {
  prune();
  return log.filter((m) => m.id > after && m.room === room);
}

function wake() {
  for (const w of [...waiters]) {
    const msgs = since(w.after, w.room);
    if (msgs.length) w.done(msgs);
  }
}

/** GET handler. [h] carries the router's reply helpers. */
function get(req, res, url, h) {
  const q = url.searchParams;
  const afterRaw = q.get('after');
  const after = afterRaw !== null && /^\d+$/.test(afterRaw) ? Number(afterRaw) : null;
  const wait = Math.min(WAIT_MAX, Math.max(0, Number(q.get('wait')) || 0));
  const room = cleanRoom(q.get('room'));
  if (!room && q.get('room')) return h.sendText(req, res, 400, 'bad room');
  // First call (no cursor): the recent history so a new client has context.
  if (after === null) {
    return h.sendJson(req, res, 200, { messages: since(-1, room).slice(-50), last: seq });
  }
  const msgs = since(after, room);
  if (msgs.length || !wait || waiters.size >= MAX_WAITERS) return h.sendJson(req, res, 200, { messages: msgs, last: seq });
  const w = {
    after,
    room,
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
  // A room that is named but invalid must fail loudly: falling back to the main room would leak a private message.
  const room = cleanRoom(b?.room);
  if (!room && typeof b?.room === 'string' && b.room !== '') return h.sendText(req, res, 400, 'bad room');
  const msg = { id: ++seq, name, text, at: Date.now(), room };
  touch(name);
  log.push(msg);
  prune();
  wake();
  h.sendJson(req, res, 200, msg);
}

/** GET /api/chat/rooms: the private and group rooms that currently hold messages. */
function rooms(req, res, h) {
  prune();
  const by = new Map();
  for (const m of log) {
    if (!m.room) continue;
    const r = by.get(m.room) || { room: m.room, at: 0, count: 0 };
    r.at = m.at; r.count++;
    by.set(m.room, r);
  }
  h.sendJson(req, res, 200, { rooms: [...by.values()] });
}

/** GET /api/chat/users: device names seen in chat during the last week. A `name` query counts as presence. */
function users(req, res, url, h) {
  const me = (url.searchParams.get('name') || '').replace(/[\u0000-\u001f\u007f|]/g, ' ').trim().slice(0, NAME_MAX);
  if (me) touch(me);
  const now = Date.now();
  for (const [n, at] of seen) if (now - at > SEEN_TTL) seen.delete(n);
  const list = [...seen].map(([name, at]) => ({ name, at })).sort((a, b) => b.at - a.at);
  h.sendJson(req, res, 200, { users: list });
}

/** Test hook. */
function reset() {
  chatfile.reset(); seq = 0; log.length = 0; rate.clear(); seen.clear(); for (const w of [...waiters]) w.done([]); }

/** POST /api/chat/file: an attachment, announced to the room as a normal message that carries `file`. */
async function postFile(req, res, ip, url, h) {
  if (!allowed(ip)) return h.sendText(req, res, 429, 'slow down', { 'Retry-After': '10' });
  const q = url.searchParams;
  const rawRoom = q.get('room') || '';
  const room = cleanRoom(rawRoom);
  if (!room && rawRoom) return h.sendText(req, res, 400, 'bad room');
  let buf;
  try { buf = await h.readBody(req, chatfile.MAX_FILE); }
  catch (e) { return h.sendText(req, res, e.status || 400, e.status === 413 ? 'file too large (5 MB limit)' : 'bad body', { Connection: 'close' }); }
  const r = chatfile.put(q.get('name'), buf);
  if (!r.file) return h.sendText(req, res, r.status, r.error);
  const name = (q.get('from') || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NAME_MAX) || 'Anonymous';
  const msg = { id: ++seq, name, text: '\u{1F4CE} ' + r.file.name, at: Date.now(), room, file: r.file };
  touch(name);
  log.push(msg);
  prune();
  wake();
  h.sendJson(req, res, 200, msg);
}

module.exports = { get, post, postFile, rooms, users, reset };
