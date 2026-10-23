// Browsing history (http(s) only, never private tabs).
const store = require("./store");

const CAP = 5000;
let entries = store.load("history", []); // newest first: {url,title,time,visits}
const persist = () => store.save("history", () => entries, 2000);
let searches = store.load("searches", []); // newest first: {q,time,count}
const persistSearches = () => store.save("searches", () => searches, 2000);
const SEARCH_CAP = 500;
const web = u => /^https?:\/\//i.test(u || "");

// Same page with a different fragment, trailing slash or www merges into one entry.
const key = u => u.replace(/#.*$/, "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "").toLowerCase();

function add(url, title) {
  if (!web(url)) return;
  const k = key(url);
  const i = entries.findIndex(e => key(e.url) === k);
  const old = i >= 0 ? entries.splice(i, 1)[0] : null;
  entries.unshift({ url, title: title || old?.title || url, time: Date.now(), visits: (old?.visits || 0) + 1 });
  if (entries.length > CAP) entries.length = CAP;
  persist();
}

function title(url, t) {
  const e = entries.find(x => x.url === url);
  if (e && t) { e.title = t; persist(); }
}

const strip = u => u.replace(/^https?:\/\/(www\.)?/i, "");

// Recency x frequency: each visit counts more the more recent the entry is.
const DAY = 864e5;
const score = (visits, time) => Math.log2(1 + visits) * 2 / (1 + (Date.now() - time) / (7 * DAY));

function isSearch(t) {
  t = (t || "").trim();
  if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t) && !t.includes(" ")) return false;
  return t.includes(" ") || !/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t) && !t.startsWith("localhost");
}

function addSearch(text) {
  const q = (text || "").trim().slice(0, 200);
  if (!isSearch(q)) return;
  const i = searches.findIndex(s => s.q.toLowerCase() === q.toLowerCase());
  const old = i >= 0 ? searches.splice(i, 1)[0] : null;
  searches.unshift({ q, time: Date.now(), count: (old?.count || 0) + 1 });
  if (searches.length > SEARCH_CAP) searches.length = SEARCH_CAP;
  persistSearches();
}

function clearSearches() { searches = []; persistSearches(); }

/** Pages: {title,url}; searches: {title:q, search:true}. Ranked together by prefix match, then recency x frequency. */
function suggest(text, n = 6) {
  const q = (text || "").trim().toLowerCase();
  if (!q) return [];
  const rows = [];
  for (const e of entries) {
    const u = strip(e.url).toLowerCase();
    const pre = u.startsWith(q);
    if (pre || e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q))
      rows.push({ r: { title: e.title, url: e.url }, s: score(e.visits, e.time) + (pre ? 3 : 0) });
  }
  for (const s of searches) {
    const l = s.q.toLowerCase();
    if (l !== q && l.includes(q)) rows.push({ r: { title: s.q, search: true }, s: score(s.count, s.time) + (l.startsWith(q) ? 2 : 0) });
  }
  return rows.sort((a, b) => b.s - a.s).slice(0, n).map(x => x.r);
}

function topSites(n = 8) {
  const byHost = new Map();
  for (const e of entries) {
    let host;
    try { host = new URL(e.url).hostname; } catch { continue; }
    const h = byHost.get(host);
    if (h) h.visits += e.visits;
    else byHost.set(host, { title: e.title, url: new URL(e.url).origin + "/", visits: e.visits });
  }
  return [...byHost.values()].sort((a, b) => b.visits - a.visits).slice(0, n).map(({ title, url }) => ({ title, url }));
}

function list(query) {
  const q = (query || "").trim().toLowerCase();
  const rows = q ? entries.filter(e => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)) : entries;
  return rows.slice(0, 500).map(({ url, title, time }) => ({ url, title, time }));
}

/** Recent pages for sharing with a linked device. */
function recent(n = 300) { return entries.slice(0, n).map(({ url, title, time, visits }) => ({ url, title, time, visits })); }

/** Merge pages from a linked device: newest time wins, visit counts take the larger value. */
function merge(list) {
  if (!Array.isArray(list)) return;
  let changed = false;
  for (const r of list.slice(0, 1000)) {
    if (!r || !web(r.url) || typeof r.url !== "string" || r.url.length > 2000) continue;
    const time = Number(r.time) || 0;
    const k = key(r.url);
    const e = entries.find(x => key(x.url) === k);
    if (e) {
      if (time > e.time) { e.time = time; e.title = String(r.title || e.title).slice(0, 300); changed = true; }
      const v = Math.min(Number(r.visits) || 1, 100000);
      if (v > e.visits) { e.visits = v; changed = true; }
    } else {
      entries.push({ url: r.url, title: String(r.title || r.url).slice(0, 300), time, visits: Math.min(Number(r.visits) || 1, 100000) });
      changed = true;
    }
  }
  if (!changed) return;
  entries.sort((a, b) => b.time - a.time);
  if (entries.length > CAP) entries.length = CAP;
  persist();
}

function remove(url) { entries = entries.filter(e => e.url !== url); persist(); }
function clear() { entries = []; persist(); }

module.exports = { add, addSearch, clearSearches, title, suggest, topSites, list, recent, merge, remove, delete: remove, clear };
