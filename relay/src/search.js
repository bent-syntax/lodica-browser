'use strict';
// Lodica Search: trims SearXNG JSON results and serves result images as small WebP files.
// Image URLs are signed with a server-side HMAC key so /api/img cannot be used as an open proxy.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { cfg } = require('./config');
const { resolveSafe } = require('./ssrf');

const IMG_DIR = path.join(cfg.dataDir, 'img');
const TMP_DIR = path.join(IMG_DIR, 'tmp');
const stats = { searches: 0, searchFail: 0, imgHit: 0, imgMade: 0, imgFail: 0 };
let key = null;

function start() {
  fs.mkdirSync(TMP_DIR, { recursive: true, mode: 0o700 });
  const kp = path.join(cfg.dataDir, 'img.key');
  try { key = fs.readFileSync(kp); } catch {}
  if (!key || key.length < 32) {
    key = crypto.randomBytes(32);
    fs.writeFileSync(kp, key, { mode: 0o600 });
  }
}

const sign = (w, u) => crypto.createHmac('sha256', key).update(w + '\n' + u).digest('base64url').slice(0, 22);

function imgUrl(u, w) {
  if (typeof u !== 'string' || !u) return undefined;
  if (u.startsWith('//')) u = 'https:' + u;
  if (!/^https?:\/\//i.test(u) || u.length > 2048) return undefined;
  return `/api/img?w=${w}&u=${encodeURIComponent(u)}&s=${sign(w, u)}`;
}

const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s) : '');
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

/** Runs a search; returns the trimmed JSON object or throws (status 400/502). */
async function search(url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q || q.length > 400) throw Object.assign(new Error('bad query'), { status: 400 });
  const p = Math.min(10, Math.max(1, Number(url.searchParams.get('p')) || 1));
  const images = url.searchParams.get('c') === 'images';
  const lang = /^[a-z]{2}(-[A-Z]{2})?$/.test(url.searchParams.get('l') || '') ? url.searchParams.get('l') : 'all';
  const su = new URL('/search', cfg.searxUrl);
  su.search = new URLSearchParams({ q, format: 'json', pageno: String(p), categories: images ? 'images' : 'general', language: lang, safesearch: '0' }).toString();
  stats.searches++;
  let j;
  try {
    const r = await fetch(su, { signal: AbortSignal.timeout(cfg.searchTimeoutMs), headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('searx ' + r.status);
    j = await r.json();
  } catch (e) {
    stats.searchFail++;
    throw Object.assign(new Error('search failed'), { status: 502 });
  }
  const seen = new Set();
  const results = [];
  for (const x of Array.isArray(j.results) ? j.results : []) {
    if (!x || typeof x.url !== 'string' || !/^https?:\/\//i.test(x.url) || seen.has(x.url)) continue;
    seen.add(x.url);
    if (images) {
      const src = x.img_src || x.thumbnail_src || x.thumbnail;
      const i = imgUrl(x.thumbnail_src || x.thumbnail || src, 320);
      if (!i) continue;
      results.push({ t: clip(x.title, 120), u: x.url, h: host(x.url), i, f: imgUrl(src, 1080) });
    } else {
      results.push({ t: clip(x.title, 160), u: x.url, h: host(x.url), c: clip(x.content, 300), d: x.publishedDate || undefined, i: imgUrl(x.thumbnail || x.img_src, 160) });
    }
    if (results.length >= 40) break;
  }
  const out = { q, p, results };
  const ib = Array.isArray(j.infoboxes) && j.infoboxes[0];
  if (ib && !images) {
    const u = ib.id && /^https?:\/\//.test(ib.id) ? ib.id : (Array.isArray(ib.urls) && ib.urls[0] && ib.urls[0].url) || undefined;
    out.box = { t: clip(ib.infobox, 120), c: clip(ib.content, 600), u, i: imgUrl(ib.img_src, 320) };
  }
  const answers = (Array.isArray(j.answers) ? j.answers : [])
    .map((a) => (typeof a === 'string' ? { a } : a && typeof a.answer === 'string' ? { a: a.answer, u: a.url || undefined } : null))
    .filter(Boolean).slice(0, 2).map((a) => ({ a: clip(a.a, 400), u: a.u }));
  if (answers.length) out.answers = answers;
  const sug = (Array.isArray(j.suggestions) ? j.suggestions : []).filter((s) => typeof s === 'string').slice(0, 6);
  if (sug.length) out.suggestions = sug;
  const cor = (Array.isArray(j.corrections) ? j.corrections : []).filter((s) => typeof s === 'string').slice(0, 1);
  if (cor.length) out.correction = cor[0];
  if (j.number_of_results > 0) out.total = j.number_of_results;
  return out;
}

// ---------- images ----------

/** GET with every hop's address validated and pinned (no DNS rebinding), redirects re-checked. */
async function fetchImage(u, hops = 0) {
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('bad url');
  const addrs = await resolveSafe(url.hostname);
  const lookup = (h, o, cb) => {
    const all = addrs.map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 }));
    if (o && o.all) cb(null, all); else cb(null, all[0].address, all[0].family);
  };
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, {
      lookup, timeout: cfg.imgTimeoutMs,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LodicaImage/1.0)', Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5' },
    }, (res) => {
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
        res.resume();
        if (hops >= 3) return reject(new Error('redirects'));
        let next; try { next = new URL(loc, url).toString(); } catch { return reject(new Error('bad redirect')); }
        return fetchImage(next, hops + 1).then(resolve, reject);
      }
      const type = String(res.headers['content-type'] || '').toLowerCase();
      if (res.statusCode !== 200 || !type.startsWith('image/') || type.includes('svg')) { res.resume(); return reject(new Error('not an image')); }
      if (Number(res.headers['content-length']) > cfg.imgMaxBytes) { res.resume(); return reject(new Error('too large')); }
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > cfg.imgMaxBytes) { req.destroy(new Error('too large')); return; } chunks.push(c); });
      res.on('end', () => resolve({ buf: Buffer.concat(chunks, n), gif: type.includes('gif') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const run = (cmd, args) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout: 20e3 }, (e) => (e ? reject(e) : resolve())));

async function convert(buf, gif, w, out) {
  const base = path.join(TMP_DIR, crypto.randomBytes(8).toString('hex'));
  const tmpOut = base + '.webp';
  try {
    await fsp.writeFile(base, buf, { mode: 0o600 });
    // gif2webp cannot resize; animated GIFs keep their size, everything else is scaled down to w.
    if (gif) await run('gif2webp', ['-quiet', '-lossy', '-q', '50', '-mt', base, '-o', tmpOut]).catch(() => run('cwebp', ['-quiet', '-q', '55', '-resize', String(w), '0', '-metadata', 'none', base, '-o', tmpOut]));
    else await run('cwebp', ['-quiet', '-q', '55', '-resize', String(w), '0', '-metadata', 'none', base, '-o', tmpOut]);
    await fsp.rename(tmpOut, out);
  } finally {
    fsp.unlink(base).catch(() => {});
    fsp.unlink(tmpOut).catch(() => {});
  }
}

const inflight = new Map();
let active = 0;
const queue = [];
const slot = () => new Promise((r) => { if (active < cfg.imgJobs) { active++; r(); } else queue.push(r); });
const release = () => { const n = queue.shift(); if (n) n(); else active--; };

/** Validates a signed image request; returns the cached WebP path or throws (status 400/403/502). */
async function image(url) {
  const u = url.searchParams.get('u') || '';
  const w = Number(url.searchParams.get('w'));
  const s = url.searchParams.get('s') || '';
  if (!cfg.imgWidths.has(w) || !u || u.length > 2048) throw Object.assign(new Error('bad request'), { status: 400 });
  const want = Buffer.from(sign(w, u));
  const got = Buffer.from(s);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw Object.assign(new Error('bad signature'), { status: 403 });
  const out = path.join(IMG_DIR, crypto.createHash('sha256').update(w + '\n' + u).digest('hex') + '.webp');
  try { await fsp.access(out); stats.imgHit++; return out; } catch {}
  if (!inflight.has(out)) {
    const job = (async () => {
      await slot();
      try {
        const { buf, gif } = await fetchImage(u);
        await convert(buf, gif, w, out);
        stats.imgMade++;
      } finally { release(); }
    })().finally(() => inflight.delete(out));
    inflight.set(out, job);
  }
  try { await inflight.get(out) || await fsp.access(out); } catch { stats.imgFail++; throw Object.assign(new Error('image failed'), { status: 502 }); }
  return out;
}

async function sweep() {
  const now = Date.now();
  let n = 0;
  for (const [dir, ttl] of [[IMG_DIR, cfg.imgTtlMs], [TMP_DIR, 36e5]]) {
    let files = [];
    try { files = await fsp.readdir(dir); } catch {}
    for (const f of files) {
      const full = path.join(dir, f);
      try { const st = await fsp.stat(full); if (st.isFile() && now - st.mtimeMs > ttl) { await fsp.unlink(full); n++; } } catch {}
    }
  }
  return n;
}

module.exports = { start, search, image, sweep, stats };
