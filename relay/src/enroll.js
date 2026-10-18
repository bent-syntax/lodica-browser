'use strict';
// Device enrollment through a website. No app feature: any browser opens https://lodica.<domain>/gate,
//   POST /gate/start         (public) -> { code, expires }, and a Set-Cookie lodica_gate=<token> on the parent domain
//   GET  /gate/state/<code>  (public) -> { state: pending | approved | expired }
//   GET  /pending/<code>     (relay bearer) -> { token, label, at }  consumed; used by `lodica-approve` on the server
// The cookie is useless until the server owner runs `sudo lodica-approve <code>`, which adds its token to the
// allow list of the gated hosts. Entries live in memory for 10 minutes. The code is random, short-lived and
// single use; wrong guesses and new requests are rate limited per address.
const crypto = require('crypto');

const TTL = 10 * 60e3;
const MAX_PENDING = 50;
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I/O/0/1
const FAIL_N = 10, FAIL_WINDOW = 10 * 60e3;
const ENROLL_N = 10, ENROLL_WINDOW = 10 * 60e3;

const pending = new Map(); // code -> { token, label, at }
const approved = new Map(); // code -> time it was taken (so the device can show "enrolled")
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
  for (const [c, t] of approved) if (now - t > TTL) approved.delete(c);
}

function hit(map, ip, max, window, now = Date.now()) {
  const r = map.get(ip);
  if (!r || now - r.start > window) { map.set(ip, { start: now, n: 1 }); if (map.size > 5000) map.clear(); return true; }
  return ++r.n <= max;
}

function cleanLabel(v) {
  return typeof v === 'string' ? v.replace(/[^\w .-]/g, '').trim().slice(0, 32) : '';
}

function parentDomain(host) {
  const m = /^lodica\.([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d+)?$/i.exec(typeof host === 'string' ? host : '');
  return m ? m[1].toLowerCase() : '';
}

/** POST /gate/start: makes a device token, remembers it under a pairing code, hands the token to the browser as a cookie. */
function start(req, res, ip, h) {
  if (!hit(posts, ip, ENROLL_N, ENROLL_WINDOW)) return h.sendText(req, res, 429, 'slow down', { 'Retry-After': '60' });
  const domain = parentDomain(req.headers.host);
  if (!domain) return h.sendText(req, res, 400, 'open this page on lodica.<your domain>');
  prune();
  if (pending.size >= MAX_PENDING) return h.sendText(req, res, 429, 'too many pending requests', { 'Retry-After': '60' });
  let code;
  do { code = newCode(); } while (pending.has(code));
  const token = crypto.randomBytes(32).toString('hex');
  const at = Date.now();
  pending.set(code, { token, label: cleanLabel(req.headers['x-lodica-label']), at });
  const cookie = `lodica_gate=${token}; Domain=${domain}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax`;
  h.sendJson(req, res, 200, { code, expires: at + TTL }, { 'Set-Cookie': cookie });
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
  approved.set(key, now);
  h.sendJson(req, res, 200, { token: e.token, label: e.label, at: e.at });
}

/** GET /gate/state/<code>: { state: 'pending' | 'approved' | 'expired' }. Reveals nothing but the state of a code. */
function status(req, res, ip, code, h) {
  const now = Date.now();
  prune(now);
  const key = typeof code === 'string' ? code.toUpperCase() : '';
  if (!CODE_RE.test(key)) return h.sendText(req, res, 400, 'bad code');
  h.sendJson(req, res, 200, { state: pending.has(key) ? 'pending' : approved.has(key) ? 'approved' : 'expired' });
}

/** Test hook. */
function reset() { pending.clear(); approved.clear(); fails.clear(); posts.clear(); }

module.exports = { start, take, status, reset, parentDomain, TTL };
