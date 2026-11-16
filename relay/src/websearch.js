'use strict';
// Last-resort web results straight from DuckDuckGo's HTML page and Mojeek, used when every SearXNG engine came back
// blocked or empty. Both pages are plain HTML without scripts, so a small parser is enough. Returns SearXNG-shaped
// results ({ url, title, content }) so the caller merges them like any other engine.
const { cfg } = require('./config');

const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };
const text = (s) => String(s || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (ENT[e.toLowerCase()] !== undefined) return ENT[e.toLowerCase()];
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return m;
  })
  .replace(/\s+/g, ' ').trim();

async function get(url, init) {
  const r = await fetch(url, {
    ...init,
    redirect: 'follow',
    signal: AbortSignal.timeout(cfg.searchTimeoutMs),
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en;q=0.8', ...(init && init.headers) },
  });
  if (!r.ok) throw new Error('status ' + r.status);
  return r.text();
}

/** DuckDuckGo's no-script page. Result links go through a /l/?uddg= redirect that holds the real address. */
function parseDdg(html) {
  const out = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="[^"]*result__a|$)/g;
  for (let m; (m = re.exec(html));) {
    let url = m[1].replace(/&amp;/g, '&');
    const u = /[?&]uddg=([^&]+)/.exec(url);
    if (u) { try { url = decodeURIComponent(u[1]); } catch { continue; } }
    if (url.startsWith('//')) url = 'https:' + url;
    if (!/^https?:\/\//i.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue; // ads
    const sn = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(a|div|td)>/.exec(m[3]);
    out.push({ url, title: text(m[2]), content: sn ? text(sn[1]) : '' });
  }
  return out;
}

/** Mojeek's result list: <h2><a class="title" href=…>…</a></h2> then <p class="s">snippet</p>. */
function parseMojeek(html) {
  const out = [];
  const re = /<a[^>]+class="title"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="title"|$)/g;
  for (let m; (m = re.exec(html));) {
    const url = m[1].replace(/&amp;/g, '&');
    if (!/^https?:\/\//i.test(url)) continue;
    const sn = /<p class="s"[^>]*>([\s\S]*?)<\/p>/.exec(m[3]);
    out.push({ url, title: text(m[2]), content: sn ? text(sn[1]) : '' });
  }
  return out;
}

/** Both engines at once; whatever answers in time is used. Never throws. */
async function direct(q, page = 1) {
  if (!cfg.directSearch) return [];
  const ddg = cfg.ddgUrl || 'https://html.duckduckgo.com/html/';
  const moj = cfg.mojeekUrl || 'https://www.mojeek.com/search';
  const body = new URLSearchParams({ q, ...(page > 1 ? { s: String((page - 1) * 30), dc: String((page - 1) * 30 + 1) } : {}) }).toString();
  const [a, b] = await Promise.all([
    get(ddg, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).then(parseDdg, () => []),
    get(moj + '?' + new URLSearchParams({ q, ...(page > 1 ? { s: String((page - 1) * 10 + 1) } : {}) })).then(parseMojeek, () => []),
  ]);
  // Interleave, so the top of the page is not all from one engine.
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
  return out;
}

module.exports = { direct, parseDdg, parseMojeek };
