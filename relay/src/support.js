'use strict';
// Support tickets. A user sends a message from the app; the maintainer's private bridge
// picks it up over the admin API, talks to the user through the same ticket and reports progress.
//   POST /api/support {text, name, app, version, platform}  -> {id}              (client token)
//   GET  /api/support/<id>                                   -> ticket           (client token)
//   POST /api/support/<id> {text, images?, resolved?}        -> ticket           (client token, user reply; resolved:true closes it)
//   POST /api/support/<id>/push {token}                      -> {}               (client token, FCM device token for instant alerts)
//   GET  /api/support/<id>/img/<name>                        -> image            (client token)
//   GET  /api/support/admin/<id>/img/<name>                  -> image            (admin token)
// images: up to 3 base64 JPEG or PNG strings per message, stored beside the ticket.
//   GET  /api/support/admin?after=<rev>&wait=<s>             -> {tickets, rev}   (admin token)
//   POST /api/support/admin/<id> {status, text}              -> ticket           (admin token)
// The admin token is a separate secret (LODICA_SUPPORT_ADMIN_TOKEN_PATH); without that file the admin API is off.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { cfg } = require('./config');
const fcm = require('./fcm');

const DIR = path.join(cfg.dataDir, 'support');
const IMG_DIR = path.join(DIR, 'img');
const ADMIN_TOKEN_PATH = process.env.LODICA_SUPPORT_ADMIN_TOKEN_PATH || '/etc/lodica-relay/support-admin-token';
const IMG_MAX = 3, IMG_BYTES = 700 * 1024, BODY_MAX = 3 * 1024 * 1024;
const TEXT_MAX = 4000, NAME_MAX = 40, MAX_MSGS = 60, MAX_TICKETS = 2000, WAIT_MAX = 25;
const STATUSES = new Set(['new', 'seen', 'needs-info', 'fixing', 'awaiting-confirm', 'done', 'closed']);
const ID_RE = /^[0-9a-f]{16}$/;
const TTL = 90 * 24 * 3600e3;

const tickets = new Map();
let rev = 0;
const waiters = new Set();
const rate = new Map();
let adminDigest = null;

function loadAdmin() {
  try {
    const t = fs.readFileSync(ADMIN_TOKEN_PATH, 'utf8').trim();
    adminDigest = t.length >= 16 ? crypto.createHash('sha256').update(t).digest() : null;
  } catch { adminDigest = null; }
}
function adminOk(req) {
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(req.headers.authorization || '');
  if (!m || !adminDigest || m[1].length > 4096) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(m[1]).digest(), adminDigest);
}

function load() {
  loadAdmin();
  try {
    fs.mkdirSync(IMG_DIR, { recursive: true, mode: 0o700 });
    for (const f of fs.readdirSync(DIR)) {
      if (!/^[0-9a-f]{16}\.json$/.test(f)) continue;
      try {
        const t = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
        tickets.set(t.id, t);
        rev = Math.max(rev, t.rev || 0);
      } catch { /* skip a damaged file */ }
    }
  } catch { /* no data dir: tickets stay in memory only */ }
}

function save(t) {
  t.rev = ++rev;
  t.updated = Date.now();
  fsp.writeFile(path.join(DIR, t.id + '.json'), JSON.stringify(t), { mode: 0o600 }).catch(() => {});
  for (const w of [...waiters]) w.check();
}

function sweep() {
  const now = Date.now();
  for (const [id, t] of tickets) {
    if (now - t.updated > TTL) {
      tickets.delete(id); fsp.unlink(path.join(DIR, id + '.json')).catch(() => {});
      for (const m of t.messages) for (const n of m.images || []) fsp.unlink(path.join(IMG_DIR, n)).catch(() => {});
    }
  }
}

const IMG_RE = /^[0-9a-f]{16}-[0-9a-f]{12}\.(jpg|png)$/;
// Decodes and stores the images of one message; returns their file names. Anything that is not a JPEG or PNG is dropped.
function saveImages(t, list) {
  const out = [];
  for (const v of Array.isArray(list) ? list.slice(0, IMG_MAX) : []) {
    if (typeof v !== 'string') continue;
    const buf = Buffer.from(v.replace(/^data:[^,]*,/, ''), 'base64');
    const ext = buf.length > 8 && buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf.length > 8 && buf.subarray(0, 4).toString('hex') === '89504e47' ? 'png' : '';
    if (!ext || buf.length > IMG_BYTES) continue;
    const name = t.id + '-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
    fsp.writeFile(path.join(IMG_DIR, name), buf, { mode: 0o600 }).catch(() => {});
    out.push(name);
  }
  return out;
}
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const view = (t) => ({ id: t.id, status: t.status, at: t.at, updated: t.updated, rev: t.rev, messages: t.messages });

function limited(ip) {
  const now = Date.now();
  const r = (rate.get(ip) || []).filter((x) => now - x < 600e3);
  if (r.length >= 8) { rate.set(ip, r); return true; }
  r.push(now); rate.set(ip, r);
  if (rate.size > 5000) rate.clear();
  return false;
}

// Hands new tickets and user messages to the support desk (support/, same machine). Off unless LODICA_DESK_URL is set.
// Fire and forget: the app never waits on the desk, and a failure only logs. The shared secret is read from a file outside the repo.
const DESK_URL = process.env.LODICA_DESK_URL || '';
const DESK_SECRET_PATH = process.env.LODICA_DESK_SECRET_PATH || '/etc/lodica-relay/desk-secret';
const deskSecret = () => { try { return fs.readFileSync(DESK_SECRET_PATH, 'utf8').trim(); } catch { return ''; } };
function forward(t, text) {
  if (!DESK_URL) return;
  const secret = deskSecret();
  if (!secret) return;
  const payload = JSON.stringify({ relayId: t.id, text, name: t.name, app: t.app, version: t.version, platform: t.platform, link: t.link || undefined });
  fetch(DESK_URL.replace(/\/$/, '') + '/relay/ticket', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret }, body: payload, signal: AbortSignal.timeout(10000),
  }).then((r) => { if (!r.ok) console.error('support desk refused ticket:', r.status); }).catch((e) => console.error('support desk unreachable:', e.message));
}

const LINK_RE = /^[0-9a-f]{64}$/;
// "Link my email": start sends a code to the address, verify turns the code into a link token, remove forgets it. The desk does the work.
async function link(req, res, step, ip, h) {
  if (!DESK_URL) return h.sendText(req, res, 503, 'email linking is not set up');
  const secret = deskSecret();
  if (!secret) return h.sendText(req, res, 503, 'email linking is not set up');
  const b = await body(req, h);
  if (!b) return h.sendText(req, res, 400, 'bad request');
  if (step !== 'remove' && limited(ip)) return h.sendText(req, res, 429, 'too many tries, try again later');
  const payload = step === 'remove' ? { link: clean(b.link, 64) } : { email: clean(b.email, 254), code: clean(b.code, 12), ip };
  try {
    const r = await fetch(DESK_URL.replace(/\/$/, '') + '/relay/link/' + step, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
    const j = await r.json().catch(() => ({}));
    h.sendJson(req, res, r.status, j);
  } catch { h.sendText(req, res, 502, 'support is not reachable right now'); }
}

async function body(req, h) {
  try { return JSON.parse((await h.readBody(req, BODY_MAX)).toString('utf8')); } catch { return null; }
}

async function create(req, res, ip, h) {
  const b = await body(req, h);
  const text = clean(b && b.text, TEXT_MAX);
  if (!text) return h.sendText(req, res, 400, 'text required');
  // with a desk, a new request needs a linked email so answers can reach the user
  if (DESK_URL && !(typeof b.link === 'string' && LINK_RE.test(b.link))) return h.sendText(req, res, 403, 'Link your email first.');
  if (limited(ip)) return h.sendText(req, res, 429, 'too many messages, try again later');
  if (tickets.size >= MAX_TICKETS) sweep();
  if (tickets.size >= MAX_TICKETS) return h.sendText(req, res, 503, 'support is full');
  const t = {
    id: crypto.randomBytes(8).toString('hex'), at: Date.now(), status: 'new',
    name: clean(b.name, NAME_MAX), app: clean(b.app, 20), version: clean(b.version, 20), platform: clean(b.platform, 40),
    messages: [],
  };
  if (typeof b.link === 'string' && LINK_RE.test(b.link)) t.link = b.link;   // a linked email (see link below); never shown back
  const images = saveImages(t, b.images);
  t.messages.push(images.length ? { from: 'user', text, at: Date.now(), images } : { from: 'user', text, at: Date.now() });
  tickets.set(t.id, t);
  save(t);
  forward(t, text);
  h.sendJson(req, res, 200, view(t));
}

function get(req, res, id, h) {
  const t = ID_RE.test(id) && tickets.get(id);
  if (!t) return h.sendText(req, res, 404, 'unknown ticket');
  h.sendJson(req, res, 200, view(t));
}

async function reply(req, res, id, ip, h) {
  const t = ID_RE.test(id) && tickets.get(id);
  if (!t) return h.sendText(req, res, 404, 'unknown ticket');
  const b = await body(req, h);
  const resolved = !!(b && b.resolved === true);
  const text = clean(b && b.text, TEXT_MAX) || (resolved ? 'Yes, it is fixed.' : '');
  if (!text) return h.sendText(req, res, 400, 'text required');
  if (t.messages.length >= MAX_MSGS) return h.sendText(req, res, 429, 'conversation is full');
  if (limited(ip)) return h.sendText(req, res, 429, 'too many messages, try again later');
  if (!t.link && typeof b.link === 'string' && LINK_RE.test(b.link)) t.link = b.link;   // older tickets get the email on the next message
  const images = saveImages(t, b.images);
  const m = { from: 'user', text, at: Date.now() };
  if (images.length) m.images = images;
  if (resolved) m.resolved = true;
  t.messages.push(m);
  if (resolved) t.status = 'closed';
  else if (t.status === 'needs-info' || t.status === 'awaiting-confirm' || t.status === 'done' || t.status === 'closed') t.status = 'new';
  save(t);
  forward(t, text);
  h.sendJson(req, res, 200, view(t));
}

async function push(req, res, id, h) {
  const t = ID_RE.test(id) && tickets.get(id);
  if (!t) return h.sendText(req, res, 404, 'unknown ticket');
  const b = await body(req, h);
  const v = b && typeof b.token === 'string' && /^[\w:\-]{20,400}$/.test(b.token) ? b.token : '';
  if (!v) return h.sendText(req, res, 400, 'token required');
  if (t.push !== v) { t.push = v; save(t); }
  h.sendJson(req, res, 200, {});
}

// Serves a stored image. `admin` routes check the admin token here; client routes are checked by the caller.
async function image(req, res, id, name, admin, h) {
  if (admin && !adminOk(req)) return h.sendText(req, res, 401, 'unauthorized');
  const t = ID_RE.test(id) && tickets.get(id);
  if (!t || !IMG_RE.test(name) || !name.startsWith(id) || !t.messages.some((m) => (m.images || []).includes(name))) return h.sendText(req, res, 404, 'unknown image');
  try {
    const buf = await fsp.readFile(path.join(IMG_DIR, name));
    res.writeHead(200, { 'content-type': name.endsWith('.png') ? 'image/png' : 'image/jpeg', 'content-length': buf.length, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' });
    res.end(buf);
  } catch { h.sendText(req, res, 404, 'unknown image'); }
}

function adminList(req, res, url, h) {
  if (!adminOk(req)) return h.sendText(req, res, 401, 'unauthorized');
  const after = Number(url.searchParams.get('after')) || 0;
  const wait = Math.min(WAIT_MAX, Math.max(0, Number(url.searchParams.get('wait')) || 0));
  const pick = () => [...tickets.values()].filter((t) => t.rev > after).sort((a, b) => a.rev - b.rev);
  const out = (list) => h.sendJson(req, res, 200, { tickets: list, rev });
  const first = pick();
  if (first.length || !wait) return out(first);
  const w = { check() { const l = pick(); if (l.length) done(l); } };
  const timer = setTimeout(() => done([]), wait * 1000);
  const done = (l) => { clearTimeout(timer); waiters.delete(w); out(l); };
  waiters.add(w);
  req.on('close', () => { clearTimeout(timer); waiters.delete(w); });
}

async function adminPost(req, res, id, h) {
  if (!adminOk(req)) return h.sendText(req, res, 401, 'unauthorized');
  const t = ID_RE.test(id) && tickets.get(id);
  if (!t) return h.sendText(req, res, 404, 'unknown ticket');
  const b = await body(req, h);
  if (!b) return h.sendText(req, res, 400, 'bad request');
  const text = clean(b.text, TEXT_MAX);
  if (b.status !== undefined && !STATUSES.has(b.status)) return h.sendText(req, res, 400, 'bad status');
  if (text) t.messages.push({ from: 'team', text, at: Date.now() });
  if (b.status) t.status = b.status;
  save(t);
  if (t.push && (text || b.status)) fcm.send(t.push, { ticket: t.id, status: t.status }).then((ok) => { if (!ok) { delete t.push; save(t); } });
  h.sendJson(req, res, 200, view(t));
}

module.exports = { load, create, link, get, reply, push, image, adminList, adminPost, sweep };
