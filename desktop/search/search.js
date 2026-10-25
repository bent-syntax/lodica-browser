"use strict";

// Lodica Search results page. Results come from the VPS search API through the helper background script;
// the AI box is answered on the phone by the app's Claude Code bridge, never by the VPS.

let BASE = "";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const q = (params.get("q") || "").trim();
const page = Math.min(10, Math.max(1, parseInt(params.get("p"), 10) || 1));
const cat = params.get("c") === "images" ? "images" : "";
const lang = (navigator.language || "").slice(0, 2).toLowerCase();

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

// Round site icon, Google style: a letter circle first, swapped for the site's own favicon once the PC has fetched it.
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

let noServer = false;
let engine = "";

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
  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = $("q").value.trim();
    if (!v) return;
    const dest = asUrl(v);
    if (dest) { location.href = dest; return; }
    // Read the chosen engine fresh: the start page's own state load may not have finished or may predate a Settings change.
    const st = await ask1({ type: "state" });
    if (st) { engine = st.engine || ""; noServer = st.api === false; }
    // The engine chosen in Settings wins; Lodica Search is only used when it is the chosen engine.
    if (engine) { location.href = engine.replace("%s", encodeURIComponent(v)); return; }
    // No server connected: skip Lodica Search and use a plain web search so the browser works on its own.
    if (!noServer) location.href = href({ q: v, c: cat });
  });
  for (const a of $("tabs").querySelectorAll("a")) {
    const c = a.dataset.c;
    a.href = href({ c });
    if (c === cat) a.classList.add("on");
  }
  wireSg();
  if (!q) {
    document.body.classList.add("home");
    topSites();
    planner();
    $("q").focus();
    return false;
  }
  document.title = q + " - Lodica Search";
  return true;
}

// Suggestions under the search box (and most-visited sites on the empty start page), supplied by the PC app.
// Other hosts of this page (the phone) answer nothing, so the box simply stays plain there.
let sgSeq = 0, sgTimer = 0, sgSel = -1;
function ask1(msg) { return browser.runtime.sendMessage(msg).catch(() => null); }
function closeSg() { $("sg").hidden = true; sgSel = -1; }
async function showSg() {
  const v = $("q").value.trim(), seq = ++sgSeq;
  const items = v ? await ask1({ type: "suggest", q: v }) : null;
  if (seq !== sgSeq || !Array.isArray(items) || !items.length) { if (seq === sgSeq) closeSg(); return; }
  const box = $("sg");
  box.replaceChildren(...items.slice(0, 8).map((it) => {
    const isPage = it.url && !it.search && /^https?:/.test(it.url) && !/^lodica:/.test(it.url);
    const a = el("a", { href: isPage ? it.url : href({ q: it.title || it.text || v }) }, el("span", null, it.title || it.text), isPage ? el("small", null, new URL(it.url).hostname) : null);
    return a;
  }));
  sgSel = -1;
  box.hidden = false;
}
// Start-page shortcuts: the user's own sites first, then (unless switched off) the most visited ones.
let quick = [], hidden = [], auto = true, adding = false;
function saveQuick() { return ask1({ type: "quick", list: quick }); }
function topSites() {
  Promise.all([ask1({ type: "state" }), ask1({ type: "top" })]).then(([st, items]) => {
    if (st && st.api === false) noServer = true;
    engine = (st && st.engine) || "";
    if (st && st.base) BASE = st.base;
    quick = st && Array.isArray(st.quick) ? st.quick : [];
    hidden = st && Array.isArray(st.hidden) ? st.hidden : [];
    auto = !st || st.auto !== false;
    drawTop(auto && Array.isArray(items) ? items : []);
  });
}
function hostOf(url) { try { return new URL(url).hostname; } catch { return ""; } }
function drawTop(items) {
  const have = new Set(quick.map((it) => safe(it.url)));
  const tiles = quick.map((it, i) => tile(it, i)).concat(
    items.filter((it) => !have.has(safe(it.url)) && !hidden.includes(hostOf(it.url))).slice(0, Math.max(0, 8 - quick.length)).map((it) => tile(it, -1)));
  if (quick.length < 24) tiles.push(adding ? addForm(items) : addTile(items));
  $("top").replaceChildren(...tiles.filter(Boolean));
}
function addTile(items) {
  const a = el("a", { class: "add", href: "#" }, el("span", { class: "fav", title: "Add shortcut", "aria-label": "Add shortcut" }, "+"));
  a.addEventListener("click", (e) => { e.preventDefault(); adding = true; drawTop(items); $("nu").focus(); });
  return a;
}
// Inline form: window.prompt() does not exist in Electron.
function addForm(items) {
  const url = el("input", { id: "nu", type: "text", placeholder: "Site address", autocomplete: "off", spellcheck: "false" });
  const name = el("input", { id: "nn", type: "text", placeholder: "Name (optional)", autocomplete: "off" });
  const done = () => { adding = false; drawTop(items); };
  const save = () => {
    const v = url.value.trim();
    if (!v) { done(); return; }
    const full = /^https?:\/\//i.test(v) ? v : "https://" + v;
    if (!safe(full)) { url.classList.add("bad"); return; }
    quick = quick.concat({ url: full, title: name.value.trim().slice(0, 40) });
    adding = false;
    saveQuick().then(() => topSites());
  };
  const f = el("form", { class: "addf" }, url, name,
    el("div", null, el("button", { type: "submit" }, "Add"), el("button", { type: "button", class: "x" }, "Cancel")));
  f.addEventListener("submit", (e) => { e.preventDefault(); save(); });
  f.querySelector(".x").addEventListener("click", done);
  f.addEventListener("keydown", (e) => { if (e.key === "Escape") done(); });
  return f;
}
function tile(it, idx) {
  const u = safe(it.url);
  if (!u) return null;
  const host = new URL(u).hostname;
  const a = el("a", { href: u }, favicon(host), el("span", { class: "n" }, (it.title || host).slice(0, 24)));
  const x = el("span", { class: "rm", title: "Remove" }, "×");
  x.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (idx >= 0) {
      quick = quick.filter((_, j) => j !== idx);
      saveQuick().then(topSites);
    } else ask1({ type: "hide", host }).then(topSites);
  });
  a.append(x);
  return a;
}
function wireSg() {
  const q$ = $("q");
  const clr = $("clr");
  const sync = () => { clr.hidden = !q$.value; };
  sync();
  clr.addEventListener("click", () => { q$.value = ""; sync(); closeSg(); q$.focus(); });
  q$.addEventListener("input", () => { sync(); clearTimeout(sgTimer); sgTimer = setTimeout(showSg, 120); });
  q$.addEventListener("keydown", (e) => {
    const rows = [...$("sg").querySelectorAll("a")];
    if (e.key === "Escape") closeSg();
    if (!rows.length || $("sg").hidden || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    sgSel = (sgSel + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
    rows.forEach((r, i) => r.classList.toggle("sel", i === sgSel));
    if (!rows[sgSel].querySelector("small")) q$.value = rows[sgSel].firstChild.textContent;
  });
  q$.addEventListener("blur", () => setTimeout(closeSg, 150));
  $("f").addEventListener("submit", (e) => {
    const r = $("sg").querySelector("a.sel");
    if (r) { e.stopImmediatePropagation(); e.preventDefault(); location.href = r.href; }
  }, true);
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
    const site = el("div", { class: "site" }, favicon(x.h),
      el("div", { class: "who" }, el("b", null, (x.h || "").replace(/^www\./, "")), el("span", null, path && path.length > 1 ? " › " + path.slice(1, 60) : "")));
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
  const close = el("button", { class: "x", title: "Close", "aria-label": "Close" }, "\u00d7");
  const v = el("div", { id: "viewer" }, close, img(x.f || x.i, null, x.t),
    el("div", { class: "cap" }, x.t || "", el("a", { href: u }, "Visit " + (x.h || "page")), el("a", { href: x.f || x.i }, "Open image")));
  v.addEventListener("click", (e) => { if (e.target === v || e.target === close || e.target.tagName === "IMG") v.remove(); });
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape" || !v.isConnected) { v.remove(); document.removeEventListener("keydown", esc); } });
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

function askButton(data) {
  const box = $("ai"), body = $("ai-body");
  box.hidden = false;
  body.className = "";
  const b = el("button", { type: "button", class: "ai-gen" }, "Generate an AI answer");
  b.onclick = () => ask(data);
  body.replaceChildren(b);
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
const priv = browser.extension.inIncognitoContext;
// Private tabs show the incognito mark in place of the kite (the "l" of the name).
if (priv) {
  const mark = document.querySelector(".brand svg.mark");
  if (mark) {
    mark.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">'
      + '<path d="M28 9.5H38.5C43 9.5 46 12 47 14.6Q47.6 16 47 17.4C46 20 43 22.5 38.5 22.5H28A6.5 6.5 0 0 1 28 9.5Z"/>'
      + '<rect x="21.5" y="33.5" width="25" height="13" rx="6.5"/><rect x="21.5" y="81.5" width="39" height="13" rx="6.5"/></g>'
      + '<rect x="20" y="56" width="32" height="16" rx="8" style="fill:var(--link)"/>'
      + '<path fill="currentColor" d="M77 68.5C84.5 68.5 89 79 89 86.5C89 92.5 84 96 77 96C70 96 65 92.5 65 86.5C65 79 69.5 68.5 77 68.5Z"/>'
      + '<path style="fill:color-mix(in srgb,var(--link) 65%,var(--bg))" d="M64 82.5Q70 79.3 77 81.8Q84 79.3 90 82.5Q91.4 88.2 86.4 90.6Q82.2 92.2 78.6 88.4Q77 87.2 75.4 88.4Q71.8 92.2 67.6 90.6Q62.6 88.2 64 82.5Z"/>'
      + '<ellipse cx="71.8" cy="85.6" rx="2.7" ry="2.2" transform="rotate(-12 71.8 85.6)" fill="currentColor"/>'
      + '<ellipse cx="82.2" cy="85.6" rx="2.7" ry="2.2" transform="rotate(12 82.2 85.6)" fill="currentColor"/>';
  }
}
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
  const [data, state] = await Promise.all([
    cached && cached.data ? Promise.resolve(cached.data) : browser.runtime.sendMessage({ type: "search", q, p: page, c: cat, l: /^[a-z]{2}$/.test(lang) ? lang : undefined })
      .catch(() => ({ error: "Search unavailable" })),
    browser.runtime.sendMessage({ type: "state" }).catch(() => ({})),
  ]);
  if (state && state.base) BASE = state.base;
  if (!data || data.error) {
    $("results").replaceChildren(el("div", { class: "ans" }, (data && data.error) || "Search unavailable"));
    return;
  }
  if (!cached) cachePut({ data });
  // Private tabs never send the question to the AI.
  if (state && state.ai && !cat && page === 1 && !priv) {
    if (state.aiAlways || (cached && cached.ai)) ask(data, cached && cached.ai);
    else askButton(data);
  }
  note(data);
  if (cat === "images") renderImages(data); else renderWeb(data);
  renderPages(data);
  if (!(data.results || []).length) $("results").append(el("div", { class: "ans" }, "No results for “" + q + "”."));
  if (cached && cached.y) requestAnimationFrame(() => scrollTo(0, cached.y));
}

// Smartschool planner on the start page: reads the ICS export the user added in Settings.
function icsDate(v, params) {
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/.exec(v);
  if (!m) return null;
  const n = m.slice(1, 7).map((x) => parseInt(x || "0", 10));
  const allDay = m[4] == null || /VALUE=DATE(?!-)/.test(params);
  const d = m[7] ? new Date(Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5])) : new Date(n[0], n[1] - 1, n[2], n[3], n[4], n[5]);
  return { d, allDay };
}
function parseIcs(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur && cur.start) out.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const [name, ...ps] = line.slice(0, i).split(";");
    const val = line.slice(i + 1).replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
    if (name === "DTSTART") { const r = icsDate(val, ps.join(";")); if (r) { cur.start = r.d; cur.allDay = r.allDay; } }
    else if (name === "DTEND") { const r = icsDate(val, ps.join(";")); if (r) cur.end = r.d; }
    else if (name === "SUMMARY") cur.title = val;
    else if (name === "LOCATION") cur.where = val;
  }
  return out;
}
function drawPlanner(text, url) {
  const box = $("plan");
  if (!url) {
    box.replaceChildren(el("h3", null, "Smartschool planner"), el("p", { class: "none" }, "No planner added yet. Add your Smartschool ICS link in Settings, Start page."));
    return;
  }
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 7 * 864e5);
  const evs = parseIcs(text || "").filter((e) => (e.end || e.start) >= from && e.start < to).sort((a, b) => a.start - b.start).slice(0, 14);
  const day = (d) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
  const kids = [el("h3", null, "Smartschool planner")];
  if (!evs.length) kids.push(el("p", { class: "none" }, text == null ? "Planner could not be loaded." : "Nothing planned in the next 7 days."));
  let last = "";
  for (const e of evs) {
    const dl = day(e.start);
    if (dl !== last) { kids.push(el("div", { class: "pd" }, dl)); last = dl; }
    const t = e.allDay ? "All day" : e.start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    kids.push(el("div", { class: "pe" }, el("b", null, t), el("span", null, (e.title || "Untitled") + (e.where ? " (" + e.where + ")" : ""))));
  }
  box.replaceChildren(...kids);
}
async function planner() {
  const r = await ask1({ type: "planner" });
  drawPlanner(r && r.text, r && r.url);
}

run();
