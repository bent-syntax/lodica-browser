'use strict';
// Support tickets. A user sends a message from the app; the maintainer's private bridge
// picks it up over the admin API, talks to the user through the same ticket and reports progress.
//   POST /api/support {text, name, app, version, platform}  -> {id}              (client token)
//   GET  /api/support/<id>                                   -> ticket           (client token)
//   POST /api/support/<id> {text}                            -> ticket           (client token, user reply)
//   GET  /api/support/admin?after=<rev>&wait=<s>             -> {tickets, rev}   (admin token)
//   POST /api/support/admin/<id> {status, text}              -> ticket           (admin token)
// The admin token is a separate secret (LODICA_SUPPORT_ADMIN_TOKEN_PATH); without that file the admin API is off.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { cfg } = require('./config');

const DIR = path.join(cfg.dataDir, 'support');
const ADMIN_TOKEN_PATH = process.env.LODICA_SUPPORT_ADMIN_TOKEN_PATH || '/etc/lodica-relay/support-admin-token';
const TEXT_MAX = 4000, NAME_MAX = 40, MAX_MSGS = 60, MAX_TICKETS = 2000, WAIT_MAX = 25;
const STATUSES = new Set(['new', 'seen', 'needs-info', 'fixing', 'done', 'closed']);
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
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
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
    if (now - t.updated > TTL) { tickets.delete(id); fsp.unlink(path.join(DIR, id + '.json')).catch(() => {}); }
  }
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

async function body(req, h) {
  try { return JSON.parse((await h.readBody(req, 16 * 1024)).toString('utf8')); } catch { return null; }
}

async function create(req, res, ip, h) {
  const b = await body(req, h);
  const text = clean(b && b.text, TEXT_MAX);
  if (!text) return h.sendText(req, res, 400, 'text required');
  if (limited(ip)) return h.sendText(req, res, 429, 'too many messages, try again later');
  if (tickets.size >= MAX_TICKETS) sweep();
  if (tickets.size >= MAX_TICKETS) return h.sendText(req, res, 503, 'support is full');
  const t = {
    id: crypto.randomBytes(8).toString('hex'), at: Date.now(), status: 'new',
    name: clean(b.name, NAME_MAX), app: clean(b.app, 20), version: clean(b.version, 20), platform: clean(b.platform, 40),
    messages: [{ from: 'user', text, at: Date.now() }],
  };
  tickets.set(t.id, t);
  save(t);
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
  const text = clean(b && b.text, TEXT_MAX);
  if (!text) return h.sendText(req, res, 400, 'text required');
  if (t.messages.length >= MAX_MSGS) return h.sendText(req, res, 429, 'conversation is full');
  if (limited(ip)) return h.sendText(req, res, 429, 'too many messages, try again later');
  t.messages.push({ from: 'user', text, at: Date.now() });
  if (t.status === 'needs-info' || t.status === 'done' || t.status === 'closed') t.status = 'new';
  save(t);
  h.sendJson(req, res, 200, view(t));
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
  h.sendJson(req, res, 200, view(t));
}

module.exports = { load, create, get, reply, adminList, adminPost, sweep };
