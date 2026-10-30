'use strict';
// Remote test session. The user turns it on in Settings, reads out a code, and a maintainer
// joins with that code to run a short allowlist of in-app UI actions. Nothing is stored on disk.
//   POST /api/support/test {}                          -> {id, code, expires}  (client token)
//   GET  /api/support/test/<id>?after=<seq>&wait=<s>   -> {state, cmds, expires} (client token)
//   POST /api/support/test/<id> {stop} | {result}      -> {}                   (client token)
//   POST /api/support/admin/test/join {code}           -> {id, expires}        (admin token)
//   POST /api/support/admin/test/<id> {action, args}   -> {seq}                (admin token)
//   GET  /api/support/admin/test/<id>?after=<seq>&wait=<s> -> {state, results} (admin token)
// The app only runs the actions below inside its own window. No files, vault, credentials or system access.
const crypto = require('crypto');

const ACTIONS = new Set(['click', 'type', 'key', 'scroll', 'tap', 'swipe', 'pointer', 'setting', 'open', 'snapshot']);
const TTL = 15 * 60e3, JOIN_WAIT = 10 * 60e3, WAIT_MAX = 25, MAX_CMDS = 300, ARGS_MAX = 2000, RESULT_MAX = 200 * 1024;
const ID_RE = /^[0-9a-f]{16}$/;
const sessions = new Map();
const waiters = new Set();
const rate = new Map();

function wake() { for (const w of [...waiters]) w(); }
function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.state !== 'stopped' && now > s.expires) { s.state = 'stopped'; s.why = 'expired'; }
    if (now > s.expires + 5 * 60e3) sessions.delete(id);
  }
  wake();
}
setInterval(sweep, 30e3).unref();

function limited(ip) {
  const now = Date.now(), r = rate.get(ip) || { n: 0, at: now };
  if (now - r.at > 600e3) { r.n = 0; r.at = now; }
  r.n++; rate.set(ip, r);
  return r.n > 10;
}
async function body(req, h, max = 256 * 1024) {
  try { return JSON.parse((await h.readBody(req, max)).toString('utf8')); } catch { return null; }
}
function view(s) { return { state: s.state, expires: s.expires, why: s.why || null }; }
function code() { return String(crypto.randomInt(0, 1e8)).padStart(8, '0'); }

async function start(req, res, ip, h) {
  if (limited(ip)) return h.sendText(req, res, 429, 'too many tries, try again later');
  const open = [...sessions.values()].filter((s) => s.state !== 'stopped').length;
  if (open >= 50) return h.sendText(req, res, 503, 'busy');
  let c; do { c = code(); } while ([...sessions.values()].some((s) => s.code === c && s.state !== 'stopped'));
  const s = { id: crypto.randomBytes(8).toString('hex'), code: c, state: 'waiting', expires: Date.now() + JOIN_WAIT, cmds: [], results: [], seq: 0 };
  sessions.set(s.id, s);
  h.sendJson(req, res, 200, { id: s.id, code: s.code, expires: s.expires });
}

function longpoll(req, res, h, pick, extra) {
  const url = new URL(req.url, 'http://x');
  const wait = Math.min(WAIT_MAX, Math.max(0, Number(url.searchParams.get('wait')) || 0));
  const out = (list) => h.sendJson(req, res, 200, extra(list));
  const first = pick();
  if (first.list.length || first.stop || !wait) return out(first.list);
  const w = () => { const p = pick(); if (p.list.length || p.stop) done(p.list); };
  const timer = setTimeout(() => done([]), wait * 1000);
  const done = (l) => { clearTimeout(timer); waiters.delete(w); out(l); };
  waiters.add(w);
  req.on('close', () => { clearTimeout(timer); waiters.delete(w); });
}

function clientGet(req, res, id, h) {
  const s = ID_RE.test(id) && sessions.get(id);
  if (!s) return h.sendText(req, res, 404, 'unknown session');
  const after = Number(new URL(req.url, 'http://x').searchParams.get('after')) || 0;
  longpoll(req, res, h, () => ({ list: s.cmds.filter((c) => c.seq > after), stop: s.state === 'stopped' }), (cmds) => ({ ...view(s), cmds }));
}

async function clientPost(req, res, id, h) {
  const s = ID_RE.test(id) && sessions.get(id);
  if (!s) return h.sendText(req, res, 404, 'unknown session');
  const b = await body(req, h, RESULT_MAX + 4096);
  if (!b) return h.sendText(req, res, 400, 'bad request');
  if (b.stop) { s.state = 'stopped'; s.why = 'stopped by user'; }
  else if (b.result && Number.isInteger(b.result.seq)) {
    const data = JSON.stringify(b.result.data === undefined ? null : b.result.data);
    if (data.length > RESULT_MAX) return h.sendText(req, res, 413, 'result too large');
    s.results.push({ seq: b.result.seq, ok: b.result.ok !== false, data: JSON.parse(data) });
  }
  wake();
  h.sendJson(req, res, 200, view(s));
}

async function join(req, res, h) {
  const b = await body(req, h);
  const s = b && [...sessions.values()].find((x) => x.code === String(b.code || '') && x.state !== 'stopped');
  if (!s || Date.now() > s.expires) return h.sendText(req, res, 404, 'unknown or expired code');
  s.state = 'active'; s.expires = Date.now() + TTL;
  wake();
  h.sendJson(req, res, 200, { id: s.id, expires: s.expires });
}

async function command(req, res, id, h) {
  const s = ID_RE.test(id) && sessions.get(id);
  if (!s) return h.sendText(req, res, 404, 'unknown session');
  if (s.state !== 'active') return h.sendText(req, res, 409, 'session is ' + s.state);
  const b = await body(req, h);
  if (!b || !ACTIONS.has(b.action)) return h.sendText(req, res, 400, 'action not allowed. Allowed: ' + [...ACTIONS].join(', '));
  const args = b.args === undefined ? {} : b.args;
  if (typeof args !== 'object' || args === null || JSON.stringify(args).length > ARGS_MAX) return h.sendText(req, res, 400, 'bad args');
  if (s.cmds.length >= MAX_CMDS) return h.sendText(req, res, 429, 'too many commands');
  const c = { seq: ++s.seq, action: b.action, args };
  s.cmds.push(c);
  wake();
  h.sendJson(req, res, 200, { seq: c.seq });
}

function adminGet(req, res, id, h) {
  const s = ID_RE.test(id) && sessions.get(id);
  if (!s) return h.sendText(req, res, 404, 'unknown session');
  const after = Number(new URL(req.url, 'http://x').searchParams.get('after')) || 0;
  longpoll(req, res, h, () => ({ list: s.results.filter((r) => r.seq > after), stop: s.state === 'stopped' }), (results) => ({ ...view(s), results }));
}

module.exports = { start, clientGet, clientPost, join, command, adminGet, ACTIONS, sweep };
