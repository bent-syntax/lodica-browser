'use strict';
// HTTPS API on its own port (default 44741): https://lodica.<domain>:44741/{api,t}/*.
const http = require('http');
const https = require('https');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { cfg, tokenOk, limited, noteFail } = require('./config');
const { parseMessage } = require('./mime');
const page = require('./tabs-page');
const search = require('./search');
const updates = require('./updates');
const chat = require('./chat');
const chatfile = require('./chatfile');
const enroll = require('./enroll');
const gatePage = require('fs').readFileSync(require('path').join(__dirname, 'gate-page.html'), 'utf8');

// Exim delivers every recipient to one maildir (tainted local parts cannot name
// directories); the alias comes from the Envelope-to header Exim adds per delivery.
const MAIL_DIR = path.join(cfg.dataDir, 'mail', 'inbox');
const TAB_DIR = path.join(cfg.dataDir, 'tabs');
const FILE_RE = /^[A-Za-z0-9_,:=-][A-Za-z0-9._,:=-]{0,254}$/;

const stats = { requests: 0, authFail: 0, mailListed: 0, mailDeleted: 0, tabPut: 0, tabGet: 0, tabDeleted: 0, sweptMail: 0, sweptTabs: 0, errors: 0, updChecks: 0, updDownloads: 0 };

// ---------- helpers ----------
function clientIp(req) {
  // Behind your own reverse proxy (loopback listener only) the proxy appends the real client
  // address as the last X-Forwarded-For entry. Direct connections are never trusted for it.
  const ra = req.socket.remoteAddress || '';
  const xff = req.headers['x-forwarded-for'];
  if ((ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1') && typeof xff === 'string' && xff) {
    const parts = xff.split(',');
    return parts[parts.length - 1].trim() || req.socket.remoteAddress;
  }
  return req.socket.remoteAddress || '?';
}

function send(req, res, status, body, headers = {}) {
  const buf = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  const h = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers };
  if (status !== 204 && status !== 304) h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' || status === 204 ? undefined : buf);
}
const sendText = (req, res, status, text, extra) => send(req, res, status, text + '\n', { 'Content-Type': 'text/plain; charset=utf-8', ...extra });
const sendJson = (req, res, status, obj, extra) => send(req, res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...extra });

function authed(req, res) {
  const ip = clientIp(req);
  if (limited(ip)) { sendText(req, res, 429, 'too many failed attempts', { 'Retry-After': '900' }); return false; }
  const h = req.headers.authorization;
  const m = typeof h === 'string' && /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(h);
  if (m && tokenOk(m[1])) return true;
  stats.authFail++;
  noteFail(ip);
  sendText(req, res, 401, 'unauthorized', { 'WWW-Authenticate': 'Bearer realm="Lodica"' });
  return false;
}

const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
// Mail id = base64url(maildir file name).
function mailIdDecode(id) {
  if (!/^[A-Za-z0-9_-]{4,512}$/.test(id)) return null;
  const file = Buffer.from(id, 'base64url').toString('utf8');
  if (!FILE_RE.test(file) || b64u(file) !== id) return null;
  return { file };
}

function parseSince(v) {
  if (v == null || v === '') return 0;
  if (/^\d{1,16}$/.test(v)) {
    const n = Number(v);
    return n < 1e11 ? n * 1000 : n;                  // accept seconds or milliseconds
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
}

async function listDir(d) {
  try { return await fsp.readdir(d); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return []; throw e; }
}

// Alias of a stored message, from the Envelope-to header (Exim strips any
// sender-supplied Envelope-to and adds its own). Cached per file name.
const aliasCache = new Map();
const domRe = new RegExp('@' + cfg.mailDomain.replace(/\./g, '\\.') + '$', 'i');
async function aliasOf(full, file) {
  let a = aliasCache.get(file);
  if (a !== undefined) return a;
  a = '';
  let fh;
  try {
    fh = await fsp.open(full, 'r');
    const buf = Buffer.alloc(16384);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    let head = buf.subarray(0, bytesRead).toString('latin1');
    const end = head.search(/\r?\n\r?\n/);
    if (end >= 0) head = head.slice(0, end);
    head = head.replace(/\r?\n[ \t]+/g, ' ');
    const m = /^Envelope-to:[ \t]*(.*)$/im.exec(head);
    if (m) {
      for (const raw of m[1].split(',')) {
        const addr = raw.trim().replace(/^<|>$/g, '').toLowerCase();
        if (!domRe.test(addr)) continue;
        const lp = addr.slice(0, addr.lastIndexOf('@'));
        if (cfg.aliasRe.test(lp)) { a = lp; break; }
      }
    }
  } catch { return ''; } finally { if (fh) await fh.close().catch(() => {}); }
  aliasCache.set(file, a);
  if (aliasCache.size > 20000) aliasCache.delete(aliasCache.keys().next().value);
  return a;
}

// Collect {alias, file, full, mtime, size} for messages in new/ and cur/.
// alias: null = all aliases.
async function collectMail(alias = null) {
  const out = [];
  for (const sub of ['new', 'cur']) {
    const dir = path.join(MAIL_DIR, sub);
    for (const file of await listDir(dir)) {
      if (!FILE_RE.test(file)) continue;
      const full = path.join(dir, file);
      try {
        const st = await fsp.stat(full);
        if (!st.isFile()) continue;
        const a = await aliasOf(full, file);
        if (alias !== null && a !== alias) continue;
        out.push({ alias: a, file, full, mtime: st.mtimeMs, size: st.size });
      } catch { /* raced with delete */ }
    }
  }
  return out;
}

// Small parse cache keyed by path+mtime+size.
const parseCache = new Map();
async function parsed(m) {
  const k = `${m.full}|${m.mtime}|${m.size}`;
  let v = parseCache.get(k);
  if (v) { parseCache.delete(k); parseCache.set(k, v); return v; }
  v = parseMessage(await fsp.readFile(m.full));
  parseCache.set(k, v);
  if (parseCache.size > 300) parseCache.delete(parseCache.keys().next().value);
  return v;
}

// ---------- mail ----------
async function mailList(req, res, url) {
  let alias = null;
  const a = url.searchParams.get('alias');
  if (a != null && a !== '') {
    alias = a.trim().toLowerCase().replace(domRe, '');
    if (!cfg.aliasRe.test(alias)) return sendText(req, res, 400, 'bad alias');
  }
  const since = parseSince(url.searchParams.get('since'));
  if (Number.isNaN(since)) return sendText(req, res, 400, 'bad since');
  const cutoff = Math.max(since, Date.now() - cfg.mailTtlMs);
  const msgs = (await collectMail(alias)).filter((m) => m.mtime >= cutoff);
  msgs.sort((x, y) => y.mtime - x.mtime);
  const out = [];
  for (const m of msgs.slice(0, cfg.mailListMax)) {
    let p;
    try { p = await parsed(m); } catch { continue; }
    const date = p.date && Number.isFinite(p.date) ? p.date : m.mtime;
    out.push({
      id: b64u(m.file),
      alias: m.alias,
      to: p.to || `${m.alias}@${cfg.mailDomain}`,
      from: p.from || '',
      subject: p.subject || '',
      date: new Date(date).toISOString(),
      received: new Date(m.mtime).toISOString(),
      text: p.text || '',
      html: p.html || null,
      links: p.links || [],
    });
  }
  stats.mailListed += out.length;
  sendJson(req, res, 200, out);
}

async function mailDelete(req, res, id) {
  const d = mailIdDecode(id);
  if (!d) return sendText(req, res, 404, 'not found');
  let gone = false;
  for (const sub of ['new', 'cur']) {
    try { await fsp.unlink(path.join(MAIL_DIR, sub, d.file)); gone = true; } catch { /* try next */ }
  }
  if (!gone) return sendText(req, res, 404, 'not found');
  aliasCache.delete(d.file);
  stats.mailDeleted++;
  send(req, res, 204);
}

// ---------- tabs ----------
const tabPath = (id) => path.join(TAB_DIR, id + '.bin');

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const cl = req.headers['content-length'];
    if (cl != null && (!/^\d+$/.test(cl) || Number(cl) > max)) return reject(Object.assign(new Error('too large'), { status: 413 }));
    const chunks = []; let n = 0; let done = false;
    req.on('data', (c) => {
      if (done) return;
      n += c.length;
      if (n > max) { done = true; reject(Object.assign(new Error('too large'), { status: 413 })); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks, n)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}

async function tabPut(req, res, id) {
  let body;
  try { body = await readBody(req, cfg.tabMaxBytes); }
  catch (e) { return sendText(req, res, e.status || 400, e.status === 413 ? 'payload too large (max 524288 bytes)' : 'bad body', { Connection: 'close' }); }
  if (body.length < cfg.tabMinBytes) return sendText(req, res, 400, 'body must be iv(12) || ciphertext+tag');
  const tmp = path.join(TAB_DIR, `.${id}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  await fsp.writeFile(tmp, body, { mode: 0o600 });
  await fsp.rename(tmp, tabPath(id));
  stats.tabPut++;
  send(req, res, 204);
}

async function tabGet(req, res, id) {
  let st;
  try { st = await fsp.stat(tabPath(id)); } catch { return sendText(req, res, 404, 'not found'); }
  if (Date.now() - st.mtimeMs > cfg.tabTtlMs) {
    fsp.unlink(tabPath(id)).catch(() => {});
    return sendText(req, res, 404, 'not found');
  }
  const buf = await fsp.readFile(tabPath(id));
  stats.tabGet++;
  send(req, res, 200, buf, {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Last-Modified': new Date(st.mtimeMs).toUTCString(),
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
}

async function tabDelete(req, res, id) {
  try { await fsp.unlink(tabPath(id)); } catch { return sendText(req, res, 404, 'not found'); }
  stats.tabDeleted++;
  send(req, res, 204);
}

// ---------- aliases ----------
// One shared list per token, so every browser on the account sees every hidden address.
const ALIAS_FILE = path.join(cfg.dataDir, 'aliases.json');
const ALIAS_MAX = 500;
let aliasList = null;
let aliasWrite = Promise.resolve();

async function loadAliases() {
  if (aliasList) return aliasList;
  try { const v = JSON.parse(await fsp.readFile(ALIAS_FILE, 'utf8')); aliasList = Array.isArray(v) ? v : []; }
  catch { aliasList = []; }
  return aliasList;
}

function saveAliases() {
  const data = JSON.stringify(aliasList);
  aliasWrite = aliasWrite.then(async () => {
    const tmp = `${ALIAS_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, data, { mode: 0o600 });
    await fsp.rename(tmp, ALIAS_FILE);
  }).catch(() => {});
  return aliasWrite;
}

const localOf = (addr) => String(addr || '').trim().toLowerCase().replace(domRe, '');

async function aliasesGet(req, res) {
  sendJson(req, res, 200, await loadAliases());
}

// Body: one {address, site, created} or an array of them. Existing entries are kept (merge by address).
async function aliasesPost(req, res) {
  let body;
  try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')); }
  catch (e) { return sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  const items = Array.isArray(body) ? body : [body];
  const list = await loadAliases();
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const local = localOf(it.address);
    if (!cfg.aliasRe.test(local)) continue;
    const entry = {
      address: `${local}@${cfg.mailDomain}`,
      site: typeof it.site === 'string' ? it.site.slice(0, 200) : '',
      created: Number.isFinite(it.created) ? it.created : Date.now(),
    };
    const i = list.findIndex((x) => localOf(x.address) === local);
    if (i >= 0) list[i] = Object.assign(list[i], entry, { site: entry.site || list[i].site }); else list.push(entry);
  }
  list.sort((x, y) => y.created - x.created);
  if (list.length > ALIAS_MAX) list.length = ALIAS_MAX;
  await saveAliases();
  sendJson(req, res, 200, list);
}

async function aliasesDelete(req, res, id) {
  const local = localOf(decodeURIComponent(id));
  const list = await loadAliases();
  const i = list.findIndex((x) => localOf(x.address) === local);
  if (i < 0) return sendText(req, res, 404, 'not found');
  list.splice(i, 1);
  await saveAliases();
  send(req, res, 204);
}

// ---------- custom theme ----------
// One user-made theme per token, newest write wins, so every browser on the account shows the same colours.
const THEME_FILE = path.join(cfg.dataDir, 'theme.json');
const hex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

async function themeGet(req, res) {
  let v = null;
  try { v = JSON.parse(await fsp.readFile(THEME_FILE, 'utf8')); } catch { /* none saved yet */ }
  sendJson(req, res, 200, v);
}

async function themePut(req, res) {
  let b;
  try { b = JSON.parse((await readBody(req, 4 * 1024)).toString('utf8')); }
  catch (e) { return sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  if (!b || !['bg', 'text', 'accent', 'accent2'].every((k) => hex(b[k]))) return sendText(req, res, 400, 'bad theme');
  const out = { bg: b.bg, text: b.text, accent: b.accent, accent2: b.accent2, at: Number.isFinite(b.at) ? b.at : Date.now() };
  const tmp = `${THEME_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(out), { mode: 0o600 });
  await fsp.rename(tmp, THEME_FILE);
  sendJson(req, res, 200, out);
}

// ---------- router ----------
async function route(req, res) {
  stats.requests++;
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return sendText(req, res, 400, 'bad request'); }
  const p = url.pathname;
  const m = req.method === 'HEAD' ? 'GET' : req.method;
  const not = (allow) => sendText(req, res, 405, 'method not allowed', { Allow: allow });

  if (p === '/api/health') return m === 'GET' ? sendText(req, res, 200, 'ok') : not('GET, HEAD');

  if (p === '/api/mail') {
    if (m !== 'GET') return not('GET, HEAD');
    if (!authed(req, res)) return;
    return mailList(req, res, url);
  }
  let r;
  if ((r = /^\/api\/mail\/([^/]+)$/.exec(p))) {
    if (m !== 'DELETE') return not('DELETE');
    if (!authed(req, res)) return;
    return mailDelete(req, res, r[1]);
  }
  if (p === '/api/chat') {
    if (m !== 'GET' && m !== 'POST') return not('GET, HEAD, POST');
    if (!authed(req, res)) return;
    const h = { sendJson, sendText, readBody };
    return m === 'GET' ? chat.get(req, res, url, h) : chat.post(req, res, clientIp(req), h);
  }
  if (p === '/api/chat/file') {
    if (m !== 'POST') return not('POST');
    if (!authed(req, res)) return;
    return chat.postFile(req, res, clientIp(req), url, { sendJson, sendText, readBody });
  }
  if ((r = /^\/api\/chat\/file\/([0-9a-f]{24})$/.exec(p))) {
    if (m !== 'GET' && m !== 'HEAD') return not('GET, HEAD');
    if (!authed(req, res)) return;
    return chatfile.serve(req, res, r[1], url.searchParams.get('dl') === '1');
  }
  if (p === '/api/chat/rooms') {
    if (m !== 'GET') return not('GET, HEAD');
    if (!authed(req, res)) return;
    return chat.rooms(req, res, { sendJson, sendText, readBody });
  }
  if (p === '/api/chat/users') {
    if (m !== 'GET') return not('GET, HEAD');
    if (!authed(req, res)) return;
    return chat.users(req, res, url, { sendJson, sendText, readBody });
  }
  if (p === '/api/chat/claim') {
    if (m !== 'GET') return not('GET, HEAD');
    if (!authed(req, res)) return;
    return chat.claim(req, res, url, { sendJson, sendText, readBody });
  }
  if (p === '/gate') {
    if (m !== 'GET') return not('GET, HEAD');
    return send(req, res, 200, gatePage, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
      'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    });
  }
  if (p === '/gate/start') {
    if (m !== 'POST') return not('POST');
    return enroll.start(req, res, clientIp(req), { sendJson, sendText, readBody });
  }
  if ((r = /^\/gate\/state\/([^/]+)$/.exec(p))) {
    if (m !== 'GET') return not('GET, HEAD');
    return enroll.status(req, res, clientIp(req), decodeURIComponent(r[1]).slice(0, 32), { sendJson, sendText, readBody });
  }
  if ((r = /^\/pending\/([^/]+)$/.exec(p))) {
    if (m !== 'GET') return not('GET, HEAD');
    if (!authed(req, res)) return;
    return enroll.take(req, res, clientIp(req), decodeURIComponent(r[1]).slice(0, 32), { sendJson, sendText, readBody });
  }
  if (p === '/api/theme') {
    if (m !== 'GET' && m !== 'PUT') return not('GET, HEAD, PUT');
    if (!authed(req, res)) return;
    return m === 'GET' ? themeGet(req, res) : themePut(req, res);
  }
  if (p === '/api/aliases') {
    if (m !== 'GET' && m !== 'POST') return not('GET, HEAD, POST');
    if (!authed(req, res)) return;
    return m === 'GET' ? aliasesGet(req, res) : aliasesPost(req, res);
  }
  if ((r = /^\/api\/aliases\/([^/]+)$/.exec(p))) {
    if (m !== 'DELETE') return not('DELETE');
    if (!authed(req, res)) return;
    return aliasesDelete(req, res, r[1]);
  }
  if ((r = /^\/api\/tabs\/([^/]+)$/.exec(p))) {
    const id = r[1];
    if (!cfg.tabIdRe.test(id)) return sendText(req, res, 404, 'not found');
    if (m === 'GET') return tabGet(req, res, id);
    if (m === 'PUT') { if (!authed(req, res)) return; return tabPut(req, res, id); }
    if (m === 'DELETE') { if (!authed(req, res)) return; return tabDelete(req, res, id); }
    return not('GET, HEAD, PUT, DELETE');
  }
  if ((r = /^\/t\/([^/]+)$/.exec(p))) {
    if (m !== 'GET') return not('GET, HEAD');
    if (!cfg.tabIdRe.test(r[1])) return sendText(req, res, 404, 'not found');
    return send(req, res, 200, page.HTML, page.HEADERS);
  }
  if (p === '/api/search') {
    if (m !== 'GET') return not('GET, HEAD');
    if (!authed(req, res)) return;
    try { return sendJson(req, res, 200, await search.search(url)); } catch (e) {
      if (e.status) return sendText(req, res, e.status, e.message);
      throw e;
    }
  }
  if (p === '/api/update/check') {
    if (m !== 'GET') return not('GET, HEAD');
    if (!authed(req, res)) return;
    try { stats.updChecks++; return sendJson(req, res, 200, await updates.check(url)); } catch (e) {
      if (e.status) return sendText(req, res, e.status, e.message);
      throw e;
    }
  }
  if (p === '/api/update/download') {
    if (m !== 'GET') return not('GET, HEAD');
    if (!authed(req, res)) return;
    let d;
    try { d = await updates.download(url); } catch (e) {
      if (e.status) return sendText(req, res, e.status, e.message);
      throw e;
    }
    stats.updDownloads++;
    const h = { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment; filename="' + d.name.replace(/[^\w.-]/g, '_') + '"' };
    if (d.size) h['Content-Length'] = d.size;
    if (d.sha256) h['X-Sha256'] = d.sha256;
    res.writeHead(200, h);
    if (req.method === 'HEAD') { d.stream.destroy(); return res.end(); }
    d.stream.on('error', () => res.destroy());
    res.on('close', () => d.stream.destroy());
    d.stream.pipe(res);
    return;
  }
  if (p === '/api/img') {
    // No bearer token: <img> tags cannot send one. The HMAC signature from /api/search gates it instead.
    if (m !== 'GET') return not('GET, HEAD');
    let file;
    try { file = await search.image(url); } catch (e) {
      if (e.status) return sendText(req, res, e.status, e.message);
      throw e;
    }
    const buf = await fsp.readFile(file);
    return send(req, res, 200, buf, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=604800, immutable' });
  }
  sendText(req, res, 404, 'not found');
}

// ---------- sweeper ----------
async function sweep(log) {
  const now = Date.now();
  let mailN = 0, tabN = 0;
  try {
    const byAlias = new Map();
    for (const m of await collectMail()) {
      if (now - m.mtime > cfg.mailTtlMs) {
        try { await fsp.unlink(m.full); mailN++; } catch {}
        aliasCache.delete(m.file);
        continue;
      }
      if (!byAlias.has(m.alias)) byAlias.set(m.alias, []);
      byAlias.get(m.alias).push(m);
    }
    // Cap per alias (unknown alias '' counts as one bucket).
    for (const keep of byAlias.values()) {
      if (keep.length <= cfg.mailMaxPerAlias) continue;
      keep.sort((x, y) => y.mtime - x.mtime);
      for (const m of keep.slice(cfg.mailMaxPerAlias)) {
        try { await fsp.unlink(m.full); mailN++; } catch {}
        aliasCache.delete(m.file);
      }
    }
    // Stale partial deliveries.
    const tmpDir = path.join(MAIL_DIR, 'tmp');
    for (const f of await listDir(tmpDir)) {
      try { const st = await fsp.stat(path.join(tmpDir, f)); if (now - st.mtimeMs > 864e5) await fsp.unlink(path.join(tmpDir, f)); } catch {}
    }
    for (const f of await listDir(TAB_DIR)) {
      const full = path.join(TAB_DIR, f);
      try {
        const st = await fsp.stat(full);
        const ttl = f.endsWith('.tmp') ? 36e5 : cfg.tabTtlMs;
        if (now - st.mtimeMs > ttl) { await fsp.unlink(full); tabN++; }
      } catch {}
    }
  } catch (e) { log('sweep error: ' + e.message); }
  let imgN = 0;
  try { imgN = await search.sweep(); } catch (e) { log('sweep error: ' + e.message); }
  stats.sweptMail += mailN; stats.sweptTabs += tabN;
  if (mailN || tabN || imgN) log(`sweep: removed ${mailN} mail, ${tabN} tabs, ${imgN} images`);
}

function start(log) {
  fs.mkdirSync(TAB_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(MAIL_DIR, { recursive: true, mode: 0o700 });
  search.start();
  const handler = (req, res) => {
    route(req, res).catch((e) => {
      stats.errors++;
      log('api error: ' + (e && e.code ? e.code : 'internal'));
      if (!res.headersSent) sendText(req, res, 500, 'internal error'); else res.destroy();
    });
  };
  const tune = (server) => {
    server.headersTimeout = 20e3;
    server.requestTimeout = 60e3;
    server.keepAliveTimeout = 30e3;
    server.on('tlsClientError', () => {});
    return server;
  };
  const server = tune(https.createServer({
    cert: fs.readFileSync(cfg.apiTlsCert), key: fs.readFileSync(cfg.apiTlsKey),
    minVersion: 'TLSv1.2', ALPNProtocols: ['http/1.1'], handshakeTimeout: 15e3,
  }, handler));
  server.listen({ host: cfg.apiHost, port: cfg.apiPort, ipv6Only: false }, () => log(`api: listening on [${cfg.apiHost}]:${cfg.apiPort}`));
  // Cert renewals: reload hourly when the files change.
  let st = [fs.statSync(cfg.apiTlsCert).mtimeMs, fs.statSync(cfg.apiTlsKey).mtimeMs].join('/');
  setInterval(() => {
    try {
      const n = [fs.statSync(cfg.apiTlsCert).mtimeMs, fs.statSync(cfg.apiTlsKey).mtimeMs].join('/');
      if (n === st) return;
      server.setSecureContext({ cert: fs.readFileSync(cfg.apiTlsCert), key: fs.readFileSync(cfg.apiTlsKey), minVersion: 'TLSv1.2' });
      st = n; log('api: TLS cert reloaded');
    } catch (e) { log('api: cert reload failed: ' + e.message); }
  }, cfg.certCheckMs).unref();
  if (cfg.apiLocalPort) {
    tune(http.createServer(handler)).listen(cfg.apiLocalPort, '127.0.0.1', () => log(`api: loopback http on 127.0.0.1:${cfg.apiLocalPort}`));
  }
  const runSweep = () => sweep(log);
  setTimeout(runSweep, 10e3).unref();
  setInterval(runSweep, cfg.sweepMs).unref();
  return server;
}

module.exports = { start, stats, sweep, mailIdDecode };
