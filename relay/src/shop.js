'use strict';
// Lodica Shop: finds the same product at trusted retailers and lists them by price.
// Candidates come from SearXNG limited to a per-country list of known shops; every page is fetched and its
// schema.org Product data (JSON-LD or meta tags) supplies the real price, so nothing is guessed.
const http = require('http');
const https = require('https');
const { cfg } = require('./config');
const { resolveSafe } = require('./ssrf');

const SHOPS = {
  BE: ['bol.com', 'coolblue.be', 'mediamarkt.be', 'vandenborre.be', 'krefel.be', 'alternate.be', 'amazon.nl', 'dreamland.be', 'decathlon.be'],
  NL: ['bol.com', 'coolblue.nl', 'mediamarkt.nl', 'azerty.nl', 'alternate.nl', 'amazon.nl', 'megekko.nl', 'wehkamp.nl', 'decathlon.nl'],
  DE: ['amazon.de', 'otto.de', 'mediamarkt.de', 'saturn.de', 'notebooksbilliger.de', 'alternate.de', 'cyberport.de', 'mindfactory.de', 'idealo.de'],
  FR: ['amazon.fr', 'fnac.com', 'darty.com', 'boulanger.com', 'ldlc.com', 'cdiscount.com', 'materiel.net'],
  GB: ['amazon.co.uk', 'currys.co.uk', 'argos.co.uk', 'scan.co.uk', 'overclockers.co.uk', 'ebuyer.com', 'johnlewis.com'],
  US: ['amazon.com', 'bestbuy.com', 'newegg.com', 'walmart.com', 'target.com', 'bhphotovideo.com', 'costco.com', 'microcenter.com'],
  CA: ['amazon.ca', 'bestbuy.ca', 'canadacomputers.com', 'walmart.ca', 'newegg.ca'],
  AU: ['amazon.com.au', 'jbhifi.com.au', 'officeworks.com.au', 'harveynorman.com.au', 'ebay.com.au'],
  ES: ['amazon.es', 'pccomponentes.com', 'mediamarkt.es', 'elcorteingles.es', 'fnac.es'],
  IT: ['amazon.it', 'mediaworld.it', 'unieuro.it', 'eprice.it'],
};
// Second-hand and refurbished sellers. Their results carry a "second hand" flag.
const SECOND = {
  BE: ['2dehands.be', 'vinted.be', 'swappie.com', 'backmarket.be', 'refurbed.be', 'refurbished.be', 'ebay.be'],
  NL: ['marktplaats.nl', 'vinted.nl', 'swappie.com', 'backmarket.nl', 'refurbed.nl', 'refurbished.nl', 'ebay.nl'],
  DE: ['kleinanzeigen.de', 'vinted.de', 'swappie.com', 'backmarket.de', 'refurbed.de', 'rebuy.de', 'ebay.de'],
  FR: ['leboncoin.fr', 'vinted.fr', 'swappie.com', 'backmarket.fr', 'refurbed.fr', 'rebuy.fr', 'ebay.fr'],
  GB: ['vinted.co.uk', 'swappie.com', 'backmarket.co.uk', 'refurbed.co.uk', 'musicmagpie.co.uk', 'cex.uk', 'ebay.co.uk'],
  US: ['swappa.com', 'backmarket.com', 'gazelle.com', 'ebay.com', 'mercari.com', 'decluttr.com'],
  CA: ['backmarket.ca', 'swappa.com', 'ebay.ca', 'kijiji.ca'],
  AU: ['backmarket.com.au', 'ebay.com.au', 'gumtree.com.au', 'cashconverters.com.au'],
  ES: ['wallapop.com', 'vinted.es', 'swappie.com', 'backmarket.es', 'refurbed.es', 'ebay.es'],
  IT: ['subito.it', 'vinted.it', 'swappie.com', 'backmarket.it', 'refurbed.it', 'ebay.it'],
};
const USED_RE = /refurb|renewed|second[\s-]?hand|tweedehands|2dehands|gebruikt|pre-?owned|\bused\b|reconditionn|occasion|gebraucht|generalüberholt|reacondicionad|ricondizionat|marktplaats|vinted/i;
const USED_HOST = /(^|\.)(vinted|swappie|backmarket|refurbed|refurbished|rebuy|2dehands|marktplaats|kleinanzeigen|leboncoin|swappa|gazelle|mercari|decluttr|wallapop|subito|kijiji|gumtree|musicmagpie|cex|cashconverters)\./;
const LANG = { BE: 'nl-BE', NL: 'nl-NL', DE: 'de-DE', FR: 'fr-FR', GB: 'en-GB', US: 'en-US', CA: 'en-CA', AU: 'en-AU', ES: 'es-ES', IT: 'it-IT' };
const COUNTRIES = Object.keys(SHOPS);
const MAX_PAGE = 600e3;

const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s) : '');
const shopOf = (h, list) => list.find((d) => h === d || h.endsWith('.' + d));

function getPage(u, hops = 0, extra) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(u); } catch { return reject(new Error('bad url')); }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return reject(new Error('bad url'));
    resolveSafe(url.hostname).then((addrs) => {
      const lookup = (h, o, cb) => {
        const all = addrs.map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 }));
        if (o && o.all) cb(null, all); else cb(null, all[0].address, all[0].family);
      };
      const req = (url.protocol === 'https:' ? https : http).get(url, {
        lookup, timeout: 7e3,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LodicaShop/1.0)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en,nl;q=0.8', ...extra },
      }, (res) => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
          res.resume();
          if (hops >= 3) return reject(new Error('redirects'));
          let next; try { next = new URL(loc, url).toString(); } catch { return reject(new Error('bad redirect')); }
          return getPage(next, hops + 1, extra).then(resolve, reject);
        }
        if (res.statusCode !== 200 || !/html/i.test(String(res.headers['content-type'] || ''))) { res.resume(); return reject(new Error('not html')); }
        const chunks = []; let n = 0;
        res.on('data', (c) => { n += c.length; if (n > MAX_PAGE) { req.destroy(); resolve(Buffer.concat(chunks, n).toString('utf8')); return; } chunks.push(c); });
        res.on('end', () => resolve(Buffer.concat(chunks, n).toString('utf8')));
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    }, reject);
  });
}

const num = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  let s = v.replace(/[^\d.,]/g, '');
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c > d) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  return parseFloat(s);
};

function* walk(n, depth = 0) {
  if (!n || typeof n !== 'object' || depth > 6) return;
  yield n;
  for (const k of Array.isArray(n) ? n : Object.values(n)) yield* walk(k, depth + 1);
}

/** Pulls name, price, currency, image and rating from schema.org JSON-LD or product meta tags. */
function parseProduct(html) {
  const out = {};
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    for (const n of walk(j)) {
      const t = [].concat(n['@type'] || []).join(',');
      if (!/Product/i.test(t)) continue;
      if (!out.name && typeof n.name === 'string') out.name = n.name;
      if (!out.desc && typeof n.description === 'string') out.desc = n.description;
      if (!out.img) { const i = [].concat(n.image || [])[0]; const u = typeof i === 'string' ? i : i && i.url; if (typeof u === 'string') out.img = u; }
      const ar = n.aggregateRating;
      if (ar && !out.rating && num(ar.ratingValue) > 0) out.rating = num(ar.ratingValue);
      if (ar && !out.reviews && num(ar.reviewCount || ar.ratingCount) > 0) out.reviews = num(ar.reviewCount || ar.ratingCount);
      for (const o of [].concat(n.offers || [])) {
        for (const x of walk(o)) {
          const p = num(x.price != null ? x.price : x.lowPrice);
          if (p > 0 && out.price == null) {
            out.price = p;
            out.cur = String(x.priceCurrency || '').toUpperCase().slice(0, 3);
            out.stock = /OutOfStock|SoldOut|Discontinued/i.test(String(x.availability || '')) ? 0 : 1;
          }
        }
      }
    }
    if (out.price != null) break;
  }
  if (out.price == null) {
    const meta = (k) => { const r = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html); return r ? r[1] : ''; };
    const p = num(meta('product:price:amount') || meta('og:price:amount'));
    if (p > 0) { out.price = p; out.cur = (meta('product:price:currency') || meta('og:price:currency')).toUpperCase().slice(0, 3); }
  }
  if (!out.name) { const t = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(html); if (t) out.name = t[1]; }
  if (!out.img) { const t = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i.exec(html); if (t) out.img = t[1]; }
  return out;
}

async function pool(items, n, fn) {
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { res[k] = await fn(items[k]); } catch { res[k] = null; } }
  }));
  return res;
}

async function searx(q, lang) {
  const su = new URL('/search', cfg.searxUrl);
  su.search = new URLSearchParams({ q, format: 'json', categories: 'general', language: lang, safesearch: '0' }).toString();
  const r = await fetch(su, { signal: AbortSignal.timeout(cfg.searchTimeoutMs), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('searx ' + r.status);
  const j = await r.json();
  return Array.isArray(j.results) ? j.results : [];
}

// vergelijk.be is the Belgian price source. Its search URL redirects to the right category and lists product cards with the lowest shop price.
const VG_HEAD = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0', 'Accept-Language': 'nl-BE,nl;q=0.9' };
const unent = (t) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Parses the product cards of a vergelijk.be result page. */
function parseVergelijk(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const c of html.split('data-test-id="card"').slice(1)) {
    const a = /<a href="(\/[^"]+)"[^>]*heading-md[^>]*>([^<]+)<\/a>/.exec(c);
    const pr = /display-md[^>]*>\s*([\d.,]+)\s*</.exec(c);
    if (!a || !pr) continue;
    const price = num(pr[1]);
    if (!(price > 0)) continue;
    // Lazy cards put the real picture in data-src and a placeholder in src; URLs may be protocol-relative or hold &amp;.
    let img = null;
    for (const t of c.match(/<img\b[^>]*>/g) || []) {
      const m = /\s(?:data-src|data-lazy-src|src)="((?:https?:)?\/\/[^"]+)"/.exec(t) || /\ssrcset="((?:https?:)?\/\/[^\s",]+)/.exec(t);
      if (m) { img = [0, unent(m[1]).replace(/^\/\//, 'https://')]; break; }
    }
    const sh = /<span class="truncate">(?:Laagste prijs bij|Ga naar)\s*([^<]+)<\/span>/.exec(c);
    out.push({ t: unent(a[2]).trim(), u: 'https://www.vergelijk.be' + a[1], p: price, i: img ? img[1] : undefined, h: sh ? unent(sh[1]).trim().replace(/\.be$/, '') : 'vergelijk.be' });
  }
  return out;
}

async function vergelijk(q) {
  const html = await getPage('https://www.vergelijk.be/q/' + encodeURIComponent(q) + '/', 0, VG_HEAD);
  return parseVergelijk(html);
}

// Category picker: the typed text is the search word inside the chosen category. The category term is added to the query unless it is already in it.
const CATEGORIES = {
  laptops: 'laptop', phones: 'smartphone', tablets: 'tablet', tvs: 'televisie', audio: 'koptelefoon', cameras: 'camera', gaming: 'game console',
  monitors: 'monitor', components: 'pc component', printers: 'printer', appliances: 'huishoudapparaat', smarthome: 'smart home', wearables: 'smartwatch',
};
const withCat = (q, cat) => (CATEGORIES[cat] && !q.toLowerCase().includes(CATEGORIES[cat]) ? CATEGORIES[cat] + ' ' + q : q);

const cache = new Map();

async function newOffers(q, cc, feats, min, max, imgUrl) {
  const compact = (t) => t.replace(/[\s-]+/g, '');
  const mark = (hay) => feats.filter((f) => hay.includes(f) || compact(hay).includes(compact(f)));
  const shops = SHOPS[cc];
  if (cc === 'BE') {
    const rows = await vergelijk(q).catch(() => []);
    const items = rows.filter((r) => (!min || r.p >= min) && (!max || r.p <= max)).map((r) => ({
      t: clip(r.t, 140), u: r.u, h: r.h, p: Math.round(r.p * 100) / 100, cur: 'EUR', i: r.i ? imgUrl ? imgUrl(r.i, 160) : r.i : undefined, m: mark(r.t.toLowerCase()),
    }));
    if (items.length) return { items, shops: ['vergelijk.be'] };
  }
  const text = [q, ...feats].join(' ');
  // Two passes keep one big retailer from filling every slot.
  const passes = [shops.slice(0, 5), shops.slice(5)].filter((s) => s.length);
  const found = (await Promise.all(passes.map((s) =>
    searx(`${text} (${s.map((d) => 'site:' + d).join(' OR ')})`, LANG[cc]).catch(() => [])))).flat();
  return { items: await fromSearch(found, shops, min, max, mark, imgUrl, false), shops };
}

async function fromSearch(found, shops, min, max, mark, imgUrl, second) {
  const seen = new Set(), per = {}, cand = [];
  for (const x of found) {
    if (!x || typeof x.url !== 'string' || seen.has(x.url)) continue;
    let h; try { h = new URL(x.url).hostname.replace(/^www\./, ''); } catch { continue; }
    const d = shopOf(h, shops);
    if (!d || (per[d] = (per[d] || 0) + 1) > 3) continue;
    seen.add(x.url);
    cand.push({ u: x.url, d, t: x.title });
  }
  const pages = await pool(cand.slice(0, 24), 6, async (c) => ({ c, p: parseProduct(await getPage(c.u)) }));
  const items = [];
  for (const r of pages) {
    if (!r || r.p.price == null || r.p.stock === 0) continue;
    const { c, p } = r;
    if (min && p.price < min) continue;
    if (max && p.price > max) continue;
    const hay = ((p.name || c.t || '') + ' ' + (p.desc || '') + ' ' + (c.t || '')).toLowerCase();
    items.push({
      t: clip(p.name || c.t, 140), u: c.u, h: c.d, p: Math.round(p.price * 100) / 100, cur: p.cur || undefined,
      i: imgUrl ? imgUrl(p.img, 160) : undefined, r: p.rating, n: p.reviews, m: mark(hay), s: second ? 1 : undefined,
    });
  }
  return items;
}

async function usedOffers(q, cc, feats, min, max, imgUrl) {
  const compact = (t) => t.replace(/[\s-]+/g, '');
  const mark = (hay) => feats.filter((f) => hay.includes(f) || compact(hay).includes(compact(f)));
  const shops = SECOND[cc];
  const text = [q, ...feats].join(' ');
  const passes = [shops.slice(0, 4), shops.slice(4)].filter((s) => s.length);
  const found = (await Promise.all(passes.map((s) =>
    searx(`${text} (${s.map((d) => 'site:' + d).join(' OR ')})`, LANG[cc]).catch(() => [])))).flat();
  return { items: await fromSearch(found, shops, min, max, mark, imgUrl, true), shops };
}

const REVIEW_SITES = ['gsmarena.com', 'notebookcheck.net', 'rtings.com', 'techradar.com', 'pocket-lint.com', 'cnet.com'];

/** Review and spec links for a search, one per site, labelled with the site name. */
async function reviewLinks(q, cc) {
  const found = await searx(`${q} (${REVIEW_SITES.map((d) => 'site:' + d).join(' OR ')})`, LANG[cc]).catch(() => []);
  const seen = new Set();
  const out = [];
  for (const x of found) {
    let host;
    try { host = new URL(x && x.url).hostname.replace(/^www\./, ''); } catch { continue; }
    const site = REVIEW_SITES.find((d) => host === d || host.endsWith('.' + d));
    if (!site || seen.has(site) || !/^https:/.test(x.url)) continue;
    seen.add(site);
    out.push({ t: clip(x.title, 100), u: x.url, h: site });
  }
  return out;
}

/** cond: new (default), used (second hand and refurbished only), all (both). Anything that looks refurbished is flagged. */
async function shop(url, imgUrl) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q || q.length > 200) throw Object.assign(new Error('bad query'), { status: 400 });
  const cc = COUNTRIES.includes(url.searchParams.get('cc')) ? url.searchParams.get('cc') : 'BE';
  const cond = ['used', 'all'].includes(url.searchParams.get('cond')) ? url.searchParams.get('cond') : 'new';
  const price = (k) => { const n = Number(url.searchParams.get(k)); return Number.isFinite(n) ? Math.min(Math.max(0, n), 1e7) : 0; };
  let min = price('min'), max = price('max');
  if (max && min > max) [min, max] = [max, min]; // reversed range: swap instead of an empty result (max 0 = no limit)
  const cat = Object.hasOwn(CATEGORIES, url.searchParams.get('cat')) ? url.searchParams.get('cat') : '';
  const feats = (url.searchParams.get('f') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  const ck = [q.toLowerCase(), cat, cc, cond, min, max, feats.join()].join('|');
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < (hit.v.items.length || hit.v.guides.length ? 30 * 60e3 : 30e3)) return hit.v; // an empty answer is likely an upstream hiccup
  // Reviews and spec sheets from sites that allow plain fetches, shown next to the vergelijk.be prices.
  const sq = withCat(q, cat);
  const guides = await reviewLinks(sq, cc);
  const [a, b] = await Promise.all([
    cond === 'used' ? { items: [], shops: [] } : newOffers(sq, cc, feats, min, max, imgUrl),
    cond === 'new' ? { items: [], shops: [] } : usedOffers(sq, cc, feats, min, max, imgUrl),
  ]);
  let items = a.items.concat(b.items);
  for (const x of items) if (!x.s && (USED_RE.test(x.t) || USED_HOST.test(x.h))) x.s = 1;
  if (cond === 'new') items = items.filter((x) => !x.s);
  if (cond === 'used') items = items.filter((x) => x.s);
  items.sort((x, y) => x.p - y.p);
  const v = { q, cat, cc, cond, feats, items, shops: a.shops.concat(b.shops), guides };
  cache.set(ck, { t: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}

module.exports = { shop, parseProduct, parseVergelijk, withCat, SHOPS, COUNTRIES, CATEGORIES };
