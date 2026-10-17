'use strict';
// Device enrollment. A client posts its device-gate token and gets a short single-use pairing code back:
//   POST /enroll          { token: <64 hex>, label?: <text> } -> { code, expires }
//   GET  /pending/<code>  -> { token, label, at }  (the pending entry is consumed: single use)
// Both routes need the relay bearer token. Entries live in memory for 10 minutes. The relay token is shared
// by every install, so the pairing code is the real secret: it is random, short-lived, single use, and wrong
// guesses are rate limited per address.
const crypto = require('crypto');

const TTL = 10 * 60e3;
const MAX_PENDING = 50;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I/O/0/1
const FAIL_N = 10, FAIL_WINDOW = 10 * 60e3;
const ENROLL_N = 10, ENROLL_WINDOW = 10 * 60e3;

const pending = new Map(); // code -> { token, label, at }
const fails = new Map();   // ip -> { start, n }
const posts = new Map();   // ip -> { start, n }

function newCode() {
  let s = '';
  const b = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] & 31];
  return s.slice(0, 4) + '-' + s.slice(4);
}

function prune(now = Date.now()) {
  for (const [c, e] of pending) if (now - e.at > TTL) pending.delete(c);
}

function hit(map, ip, max, window, now = Date.now()) {
  const r = map.get(ip);
  if (!r || now - r.start > window) { map.set(ip, { start: now, n: 1 }); if (map.size > 5000) map.clear(); return true; }
  return ++r.n <= max;
}

function cleanLabel(v) {
  return typeof v === 'string' ? v.replace(/[^\w .-]/g, '').trim().slice(0, 32) : '';
}

/** POST /enroll */
async function post(req, res, ip, h) {
  if (!hit(posts, ip, ENROLL_N, ENROLL_WINDOW)) return h.sendText(req, res, 429, 'slow down', { 'Retry-After': '60' });
  let b;
  try { b = JSON.parse((await h.readBody(req, 1024)).toString('utf8')); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  if (typeof b?.token !== 'string' || !TOKEN_RE.test(b.token)) return h.sendText(req, res, 400, 'bad token');
  prune();
  if (pending.size >= MAX_PENDING) return h.sendText(req, res, 429, 'too many pending requests', { 'Retry-After': '60' });
  let code;
  do { code = newCode(); } while (pending.has(code));
  const at = Date.now();
  pending.set(code, { token: b.token, label: cleanLabel(b.label), at });
  h.sendJson(req, res, 200, { code, expires: at + TTL });
}

/** GET /pending/<code>: consumes the entry. */
function take(req, res, ip, code, h) {
  const now = Date.now();
  const f = fails.get(ip);
  if (f && now - f.start <= FAIL_WINDOW && f.n >= FAIL_N) return h.sendText(req, res, 429, 'too many attempts', { 'Retry-After': '600' });
  prune(now);
  const key = typeof code === 'string' ? code.toUpperCase() : '';
  const e = CODE_RE.test(key) ? pending.get(key) : undefined;
  if (!e) {
    hit(fails, ip, Infinity, FAIL_WINDOW, now);
    return h.sendText(req, res, 404, 'unknown or expired code');
  }
  pending.delete(key);
  h.sendJson(req, res, 200, { token: e.token, label: e.label, at: e.at });
}

/** Test hook. */
function reset() { pending.clear(); fails.clear(); posts.clear(); }

module.exports = { post, take, reset, TTL };
