"use strict";

// Lodica Search results page. Results come from the VPS search API through the helper background script;
// the AI box is answered on the phone by the app's Claude Code bridge, never by the VPS.

let BASE = "";
browser.storage.local.get(["domain", "legacy"]).then((r) => { if (r && r.domain) BASE = "https://lodica." + r.domain + (r.legacy ? ":44741" : ""); }, () => {});
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const q = (params.get("q") || "").trim();
const page = Math.min(10, Math.max(1, parseInt(params.get("p"), 10) || 1));
const cat = params.get("c") === "images" ? "images" : "";
let hasApi = null;
const lang = (navigator.language || "").slice(0, 2).toLowerCase();

// Colours come from the app theme through the helper; without them the stylesheet defaults apply.
function applyTheme(t) {
  if (!t || typeof t !== "object") return;
  const hex = /^#[0-9a-fA-F]{6}$/, r = document.documentElement.style;
  const set = (name, v) => { if (hex.test(v)) r.setProperty(name, v); };
  set("--bg", t.bg); set("--raised", t.raised); set("--high", t.high); set("--text", t.text); set("--muted", t.muted);
  set("--amber", t.amber); set("--coral", t.coral); set("--link", t.amber);
  r.setProperty("color-scheme", t.dark ? "dark" : "light");
}

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    if (attrs[k] == null) continue;
    if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}

function href(opts) {
  const s = new URLSearchParams({ q: opts.q != null ? opts.q : q });
  if (opts.c) s.set("c", opts.c);
  if (opts.p > 1) s.set("p", String(opts.p));
  return "search.html?" + s;
}

// Only http(s) links are rendered; anything else from the index is dropped.
function safe(u) {
  try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:" ? x.href : null; } catch (e) { return null; }
}

function img(src, cls, alt) {
  if (!src) return null;
  return el("img", { src: BASE + src, class: cls, alt: alt || "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
}

// Round site icon: a letter circle first, swapped for the site's own favicon once the helper has fetched it.
const iconCache = new Map();
function favicon(host) {
  const letter = (host || "?").replace(/^www\./, "").charAt(0).toUpperCase();
  const c = el("span", { class: "fav" }, letter);
  if (!host) return c;
  if (!iconCache.has(host)) iconCache.set(host, browser.runtime.sendMessage({ type: "icon", h: host }).then((r) => r && r.url || null, () => null));
  iconCache.get(host).then((url) => {
    if (!url) return;
    const i = new Image();
    i.onload = () => { c.textContent = ""; c.append(i); };
    i.alt = "";
    i.src = url;
  });
  return c;
}

// History suggestions under the box and most-visited sites on the empty start page, from the app.
// Private tabs get neither, and nothing is asked of the app for them.
const priv = browser.extension.inIncognitoContext;
let sgSeq = 0, sgTimer = 0;
function ask1(msg) { return priv ? Promise.resolve(null) : browser.runtime.sendMessage(msg).catch(() => null); }
function closeSg() { $("sg").hidden = true; }
async function showSg() {
  const v = $("q").value.trim(), seq = ++sgSeq;
  const items = v ? await ask1({ type: "suggest", q: v }) : null;
  if (seq !== sgSeq || !Array.isArray(items) || !items.length) { if (seq === sgSeq) closeSg(); return; }
  $("sg").replaceChildren(...items.slice(0, 8).map((it) => {
    const u = it.url && safe(it.url);
    return el("a", { href: u || href({ q: it.title || v }) }, el("span", null, it.title || v), u ? el("small", null, new URL(u).hostname) : null);
  }));
  $("sg").hidden = false;
}
// Start-page shortcuts: the user's own first, then the most visited sites unless switched off.
const store = {
  get sites() { try { const v = JSON.parse(localStorage.getItem("sites")); return Array.isArray(v) ? v.filter((x) => x && safe(x.u)) : []; } catch (e) { return []; } },
  set sites(v) { localStorage.setItem("sites", JSON.stringify(v)); },
  get auto() { return localStorage.getItem("auto") !== "0"; },
  set auto(v) { localStorage.setItem("auto", v ? "1" : "0"); },
};
let editing = false;

function tile(u, title, onRemove) {
  const host = new URL(u).hostname;
  const a = el("a", { href: u }, favicon(host), el("span", { class: "n" }, (title || host).slice(0, 24)));
  if (onRemove) {
    const x = el("span", { class: "rm" }, "×");
    x.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onRemove(); });
    a.append(x);
  }
  return a;
}

async function topSites() {
  const mine = store.sites;
  const auto = store.auto ? await ask1({ type: "top" }) : null;
  const seen = new Set(mine.map((x) => new URL(x.u).hostname));
  const tiles = mine.map((x, i) => tile(x.u, x.n, editing ? () => { const l = store.sites; l.splice(i, 1); store.sites = l; topSites(); } : null));
  if (Array.isArray(auto)) {
    for (const it of auto.slice(0, 8)) {
      const u = safe(it.url);
      if (u && !seen.has(new URL(u).hostname)) tiles.push(tile(u, it.title));
    }
  }
  $("top").replaceChildren(...tiles);
}

function setupHome() {
  $("topbar").hidden = false;
  $("auto").checked = store.auto;
  $("edit").addEventListener("click", (e) => {
    e.preventDefault();
    editing = !editing;
    $("edit").textContent = editing ? "Done" : "Edit shortcuts";
    $("addsite").hidden = $("autorow").hidden = !editing;
    topSites();
  });
  $("auto").addEventListener("change", () => { store.auto = $("auto").checked; topSites(); });
  $("addsite").addEventListener("submit", (e) => {
    e.preventDefault();
    let u = $("as-u").value.trim();
    if (!u) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
    u = safe(u);
    if (!u) { $("as-u").focus(); return; }
    const l = store.sites;
    l.push({ u, n: $("as-n").value.trim() || new URL(u).hostname.replace(/^www\./, "") });
    store.sites = l;
    $("as-n").value = $("as-u").value = "";
    topSites();
  });
  topSites();
}

// Learn early whether a relay exists, and apply the app theme.
browser.runtime.sendMessage({ type: "state" }).then((st) => { hasApi = !!(st && st.api); applyTheme(st && st.theme); }, () => {});

/** A typed link (scheme, or a dotted host / localhost / IPv4 with no spaces) opens directly instead of searching. */
function asUrl(v) {
  if (/\s/.test(v)) return null;
  if (/^https?:\/\/\S+$/i.test(v)) return v;
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#]\S*)?$/i.test(v)) return "http://" + v;
  if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(v)) return "https://" + v;
  return null;
}

function setup() {
  $("q").value = q;
  $("f").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("q").value.trim();
    if (!v) return;
    const dest = asUrl(v);
    if (dest) { location.href = dest; return; }
    // Without a relay there is no search API, so the question goes to DuckDuckGo instead.
    if (hasApi === false) location.href = "https://duckduckgo.com/?q=" + encodeURIComponent(v);
    else location.href = href({ q: v, c: cat });
  });
  for (const a of $("tabs").querySelectorAll("a")) {
    const c = a.dataset.c;
    a.href = href({ c });
    if (c === cat) a.classList.add("on");
  }
  const sync = () => { $("x").hidden = !$("q").value; };
  sync();
  $("x").addEventListener("click", () => { $("q").value = ""; sync(); closeSg(); $("q").focus(); });
  $("q").addEventListener("input", () => { sync(); clearTimeout(sgTimer); sgTimer = setTimeout(showSg, 150); });
  $("q").addEventListener("blur", () => setTimeout(closeSg, 200));
  if (!q) {
    document.body.classList.add("home");
    setupHome();
    $("q").focus();
    return false;
  }
  document.title = q + " - Lodica Search";
  return true;
}

function skeleton() {
  const r = $("results");
  r.replaceChildren();
  for (let i = 0; i < 5; i++) r.append(el("div", { class: "skel" }));
}

function renderWeb(data) {
  const r = $("results");
  r.replaceChildren();
  for (const a of data.answers || []) {
    const u = safe(a.u);
    r.append(el("div", { class: "ans" }, a.a, u ? el("br") : null, u ? el("a", { href: u }, new URL(u).hostname) : null));
  }
  if (data.box) {
    const b = data.box, u = safe(b.u);
    r.append(el("div", { class: "box" }, img(b.i, null, b.t), el("h2", null, b.t || ""), el("p", null, b.c || ""),
      u ? el("a", { class: "more", href: u }, "More on " + new URL(u).hostname) : null));
  }
  for (const x of data.results || []) {
    const u = safe(x.u);
    if (!u) continue;
    const path = decodeURI(new URL(u).pathname).replace(/\/$/, "");
    const site = el("div", { class: "site" }, favicon(x.h), el("b", null, x.h || ""), path && path.length > 1 ? " › " + path.slice(1, 60) : null);
    const text = el("p", null, x.d ? el("span", { class: "date" }, x.d.slice(0, 10) + " — ") : null, x.c || "");
    r.append(el("a", { class: "r", href: u }, el("div", { class: "txt" }, site, el("h3", null, x.t || x.h), text), img(x.i)));
  }
  if (data.suggestions && data.suggestions.length) {
    r.append(el("div", { class: "chips-t" }, "Related searches"));
    r.append(el("div", { class: "chips" }, ...data.suggestions.map((s) => el("a", { href: href({ q: s }) }, s))));
  }
}

function renderImages(data) {
  const r = $("results");
  r.replaceChildren();
  const grid = el("div", { class: "grid" });
  for (const x of data.results || []) {
    const u = safe(x.u);
    if (!u || !x.i) continue;
    const a = el("a", { href: u }, img(x.i, null, x.t), el("span", null, x.h || ""));
    a.addEventListener("click", (e) => { e.preventDefault(); view(x, u); });
    grid.append(a);
  }
  r.append(grid);
}

function view(x, u) {
  const v = el("div", { id: "viewer" }, img(x.f || x.i, null, x.t),
    el("div", { class: "cap" }, x.t || "", el("a", { href: u }, "Visit " + (x.h || "page"))));
  v.addEventListener("click", (e) => { if (e.target === v || e.target.tagName === "IMG") v.remove(); });
  document.body.append(v);
}

function renderPages(data) {
  const n = $("pages");
  n.replaceChildren();
  if (!(data.results || []).length) return;
  const last = Math.min(10, Math.max(page + 2, 5));
  for (let i = Math.max(1, page - 2); i <= last; i++) {
    n.append(el("a", { href: href({ c: cat, p: i }), class: i === page ? "on" : null }, String(i)));
  }
}

function note(data) {
  const n = $("note");
  n.replaceChildren();
  if (data.correction) n.append("Did you mean ", el("a", { href: href({ q: data.correction, c: cat }) }, data.correction), "?");
  else if (data.total && page === 1) n.append("About " + data.total.toLocaleString() + " results");
}

function ask(data, cachedAnswer) {
  const box = $("ai"), body = $("ai-body");
  box.hidden = false;
  body.className = "wait";
  body.textContent = "Thinking…";
  // Top snippets give the model fresh context; the app trims them to fit the token budget.
  const ctx = (data.results || []).slice(0, 4).map((x) => (x.t || "") + ": " + (x.c || "")).join("\n");
  const history = [];
  const form = $("ai-follow"), input = $("ai-q"), send = $("ai-send");
  form.hidden = true;
  // One question at a time; the whole conversation so far goes along so answers can build on it.
  const turn = (question, target) => {
    input.disabled = send.disabled = true;
    return browser.runtime.sendMessage({ type: "ask", q: question, ctx, history: history.slice() }).then((a) => a, () => null).then((a) => {
      if (a && a.text) {
        target.className = ""; target.textContent = a.text;
        history.push({ role: "user", text: question }, { role: "assistant", text: a.text });
      } else { target.className = "err"; target.textContent = (a && a.error) || "No answer"; }
      input.disabled = send.disabled = false;
      form.hidden = history.length === 0;
      return !!(a && a.text);
    });
  };
  if (cachedAnswer) {
    body.className = ""; body.textContent = cachedAnswer;
    history.push({ role: "user", text: q }, { role: "assistant", text: cachedAnswer });
    form.hidden = false;
  } else turn(q, body).then((ok) => { if (ok) cachePut({ ai: body.textContent }); });
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v || input.disabled) return;
    input.value = "";
    const you = el("div", { class: "ai-you" }, v);
    const reply = el("div", { class: "wait" }, "Thinking…");
    $("ai-thread").append(you, reply);
    turn(v, reply).then(() => input.focus());
  };
}

// Back-navigation (and reloads) reuse the last answer for a query instead of asking the server again.
const CACHE_MS = 10 * 60e3;
const ckey = "lodica:" + [q, page, cat, lang].join("|");
function cacheGet() {
  if (priv) return null;
  try {
    const c = JSON.parse(sessionStorage.getItem(ckey) || "null");
    return c && Date.now() - c.at < CACHE_MS ? c : null;
  } catch (e) { return null; }
}
function cachePut(patch) {
  if (priv) return;
  try { sessionStorage.setItem(ckey, JSON.stringify(Object.assign({ at: Date.now() }, cacheGet() || {}, patch))); } catch (e) { /* storage full */ }
}
// Remember where the reader was, so coming back lands on the same result.
addEventListener("pagehide", () => cachePut({ y: scrollY }));

async function run() {
  if (!setup()) return;
  const cached = cacheGet();
  if (!cached || !cached.data) skeleton();
  // Results are drawn as soon as they arrive; the theme/AI state is applied after, not waited for.
  const statePromise = browser.runtime.sendMessage({ type: "state" }).catch(() => ({}));
  const data = cached && cached.data ? cached.data : await browser.runtime.sendMessage({ type: "search", q, p: page, c: cat, l: /^[a-z]{2}$/.test(lang) ? lang : undefined })
    .catch(() => ({ error: "Search unavailable" }));
  if (!data || data.error) {
    const st = await statePromise;
    if (st && st.api === false) { location.replace("https://duckduckgo.com/?q=" + encodeURIComponent(q)); return; }
    $("results").replaceChildren(el("div", { class: "ans" }, (data && data.error) || "Search unavailable"));
    return;
  }
  if (!cached) cachePut({ data });
  note(data);
  if (cat === "images") renderImages(data); else renderWeb(data);
  renderPages(data);
  if (!(data.results || []).length) $("results").append(el("div", { class: "ans" }, "No results for “" + q + "”."));
  if (cached && cached.y) requestAnimationFrame(() => scrollTo(0, cached.y));
  const state = await statePromise;
  if (state && state.api === false) { location.replace("https://duckduckgo.com/?q=" + encodeURIComponent(q)); return; }
  // Private tabs never send the question to the AI.
  applyTheme(state && state.theme);
  if (state && state.ai && !cat && page === 1 && !priv) ask(data, cached && cached.ai);
}

run();
