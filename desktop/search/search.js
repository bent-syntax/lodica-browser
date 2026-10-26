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
    notes();
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
    placeWidgets(st && st.pos);
    drawTop(auto && Array.isArray(items) ? items : []);
  });
}
// Planner and notes: left, right or below the search bar (Settings). Main already keeps them apart.
function placeWidgets(pos) {
  $("plan").dataset.pos = (pos && pos.plan) || "below";
  $("notes").dataset.pos = (pos && pos.notes) || "left";
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
    const full = /^https?:\/\//i.test(v) ? v : (/^((\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])(:\d+)?([/?#]|$)/i.test(v) ? "http://" : "https://") + v;
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
  return { y: n[0], mo: n[1], d: n[2], h: n[3], mi: n[4], z: !!m[7] && !allDay, allDay };
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
    const raw = line.slice(i + 1);
    const val = raw.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
    if (name === "DTSTART") { const r = icsDate(val, ps.join(";")); if (r) { cur.start = r; cur.allDay = r.allDay; } }
    else if (name === "DTEND") { const r = icsDate(val, ps.join(";")); if (r) cur.end = r; }
    else if (name === "SUMMARY") cur.title = val;
    else if (name === "LOCATION") cur.where = val;
    else if (name === "DESCRIPTION") cur.desc = raw.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
  }
  return out;
}
// Day number and minute of the day of a moment in the planner time zone (Settings, default Brussels).
function plannerZone(tz) {
  tz = String(tz || "").trim();
  if (!tz) return "Europe/Brussels";
  if (tz.toLowerCase() === "local") return undefined;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return tz; } catch { return "Europe/Brussels"; }
}
function zoned(date, zone) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(date);
  const g = (t) => parseInt(p.find((x) => x.type === t).value, 10);
  return { day: Date.UTC(g("year"), g("month") - 1, g("day")) / 864e5, min: g("hour") * 60 + g("minute") };
}
function wall(r, zone) {
  if (r.z) return zoned(new Date(Date.UTC(r.y, r.mo - 1, r.d, r.h, r.mi)), zone);
  return { day: Date.UTC(r.y, r.mo - 1, r.d) / 864e5, min: r.allDay ? 0 : r.h * 60 + r.mi };
}
// Subject per time slot (Settings): one rule per line, "Mon 08:30-09:20 Maths". Without a day it applies every day.
function slotRules(text) {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*(?:(sun|mon|tue|wed|thu|fri|sat)\w*\s+)?(\d{1,2}):(\d\d)\s*-\s*(\d{1,2}):(\d\d)\s+(.+?)\s*$/i.exec(line);
    if (m) out.push({ wd: m[1] ? days.indexOf(m[1].toLowerCase()) : -1, from: +m[2] * 60 + +m[3], to: +m[4] * 60 + +m[5], subject: m[6].slice(0, 60) });
  }
  return out;
}
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
let plannerData = null, plannerOpen = "";
const plannerDone = () => { try { return new Set(JSON.parse(localStorage.getItem("plannerDone") || "[]")); } catch (e) { return new Set(); } };
/** A short burst of confetti from the middle of the page. */
function confetti() {
  const box = el("div", { class: "confetti" });
  const colours = ["#F59E0B", "#F43F5E", "#E5E7EB", "#34D399", "#60A5FA"];
  for (let i = 0; i < 60; i++) {
    const p = el("i");
    p.style.cssText = "--dx:" + Math.round((Math.random() - 0.5) * 700) + "px;--dy:" + Math.round(-120 - Math.random() * 280) + "px;--r:" + Math.round(Math.random() * 720) + "deg;background:" + colours[i % colours.length] + ";animation-delay:" + Math.round(Math.random() * 150) + "ms";
    box.appendChild(p);
  }
  box.appendChild(el("b", null, "All done for today!"));
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}
const plannerTick = (key) => { const d = plannerDone(); if (!d.delete(key)) d.add(key); try { localStorage.setItem("plannerDone", JSON.stringify([...d].slice(-300))); } catch (e) { /* storage full */ } };
function drawPlanner(text, url, opts) {
  plannerData = { text, url, opts };
  const box = $("plan");
  if (!url) {
    box.replaceChildren(el("h3", null, "Smartschool planner"), el("p", { class: "none" }, "No planner added yet. Add your Smartschool ICS link in Settings, Start page."));
    resizable(box, "plan");
    return;
  }
  opts = opts || {};
  const zone = plannerZone(opts.tz);
  const now = zoned(new Date(), zone);
  const rules = slotRules(opts.slots);
  const kindOf = (t) => (/^(huistaak|meebrengen):\s/i.test(t) ? "task" : /^toets:\s/i.test(t) ? "test" : "lesson");
  let evs = parseIcs(text || "").map((e) => {
    const s = wall(e.start, zone), f = e.end ? wall(e.end, zone) : s;
    const sub = /Vakken:[ \t]*([^\n]+)/i.exec(e.desc || "");
    return { day: s.day, min: s.min, endDay: f.day, end: f.min, allDay: e.allDay, title: e.title || "Untitled", where: e.where, desc: (e.desc || "").trim().slice(0, 600), subject: sub ? sub[1].trim() : "", kind: kindOf(e.title || "") };
  }).filter((e) => (e.allDay ? e.endDay - 1 : e.endDay) >= now.day && e.day < now.day + 7).map((e) => Object.assign(e, { day: Math.max(e.day, now.day) }));
  // A subject set for a time slot replaces the normal lessons in that slot. Tasks and tests always stay.
  for (let d = now.day; d < now.day + 7; d++) {
    for (const r of rules) {
      if (r.wd >= 0 && r.wd !== (d + 4) % 7) continue;
      evs = evs.filter((e) => !(e.kind === "lesson" && !e.allDay && e.day === d && e.min < r.to && e.end > r.from));
      evs.push({ day: d, min: r.from, endDay: d, end: r.to, title: r.subject, kind: "lesson", slot: true });
    }
  }
  const prio = (e) => (e.kind === "lesson" ? 1 : 0);
  evs.sort((a, b) => a.day - b.day || (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || a.min - b.min || prio(a) - prio(b));
  evs = evs.slice(0, 14);
  const label = (d) => new Date(d * 864e5).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
  const kids = [el("h3", null, "Smartschool planner")];
  if (!evs.length) kids.push(el("p", { class: "none" }, text == null ? "Planner could not be loaded." : "Nothing planned in the next 7 days."));
  let last = -1, marked = false;
  const mark = () => { marked = true; kids.push(el("div", { class: "pn" }, el("b", null, hhmm(now.min)), el("i"))); };
  for (const e of evs) {
    if (e.day !== last) {
      if (last === now.day && !marked) mark();
      if (e.day > now.day && !marked) { kids.push(el("div", { class: "pd" }, label(now.day))); mark(); }
      kids.push(el("div", { class: "pd" }, label(e.day)));
      last = e.day;
    }
    const live = e.day === now.day && !marked && !e.allDay && e.min <= now.min && now.min < e.end;
    if (e.day === now.day && !marked && !e.allDay && e.min > now.min) mark();
    const main = e.kind === "lesson" && e.subject ? e.subject : e.title;
    const more = e.kind !== "lesson" && e.subject ? " · " + e.subject : "";
    const key = e.day + "|" + e.min + "|" + e.title;
    // tasks and tests that start inside a lesson are folded into that lesson row
    const inside = e.kind === "lesson" && !e.allDay ? evs.filter((t) => t.kind !== "lesson" && !t.allDay && t.day === e.day && t.min >= e.min && t.min < e.end) : [];
    const done = plannerDone();
    const tint = e.kind !== "lesson" ? e.kind : "";
    const cls = "pe" + (opts.colors !== false && tint ? " " + tint : "") + (e.kind !== "lesson" && done.has(key) ? " done" : "");
    const tests = inside.filter((t) => t.kind === "test").length;
    // a lesson with 2 tests and 1 task is 2/3 red and 1/3 yellow
    const split = opts.colors !== false && e.kind === "lesson" && inside.length ? Math.round(100 * tests / inside.length) : -1;
    const extra = inside.filter((t) => !done.has(t.day + "|" + t.min + "|" + t.title)).map((t) => t.title).join(" · ");
    const row = el("div", { class: cls + (live ? " live" : ""), style: split >= 0 ? "background:linear-gradient(90deg,rgba(244,63,94,.35) " + split + "%,rgba(245,158,11,.35) " + split + "%);border-radius:12px;padding:4px 8px;margin:0 -8px" : "" }, el("b", null, e.allDay ? "All day" : hhmm(e.min) + "-" + hhmm(e.endDay === e.day ? e.end : 1440)), el("span", null, main + more + (extra ? "  " + extra : "")), e.where ? el("em", null, e.where) : null);
    row.onclick = () => { plannerOpen = plannerOpen === key ? "" : key; drawPlanner(plannerData.text, plannerData.url, plannerData.opts); };
    if (live) { marked = true; row.appendChild(el("i", { class: "now", style: "top:" + Math.round(100 * (now.min - e.min) / Math.max(1, e.end - e.min)) + "%" }, el("u", null, hhmm(now.min)))); }
    kids.push(row);
    if (plannerOpen === key) {
      const det = [el("b", null, main + more), el("div", null, label(e.day) + ", " + (e.allDay ? "all day" : hhmm(e.min) + "-" + hhmm(e.endDay === e.day ? e.end : 1440)))];
      if (e.where) det.push(el("div", null, e.where));
      if (e.desc) det.push(el("div", { class: "dd" }, e.desc));
      for (const t of e.kind !== "lesson" ? [e] : inside) {
        const tk = t.day + "|" + t.min + "|" + t.title;
        const c = el("label", { class: "tick" }, el("input", { type: "checkbox" }), t.title);
        c.firstChild.checked = done.has(tk);
        c.firstChild.onclick = (ev) => ev.stopPropagation();
        c.firstChild.onchange = () => {
          plannerTick(tk);
          // ticking the last open task or test of a day is worth a party
          const d = plannerDone();
          if (d.has(tk) && evs.filter((x) => x.kind !== "lesson" && !x.allDay && x.day === t.day).every((x) => d.has(x.day + "|" + x.min + "|" + x.title))) confetti();
          drawPlanner(plannerData.text, plannerData.url, plannerData.opts);
        };
        det.push(c);
      }
      kids.push(el("div", { class: "pi" }, ...det));
    }
  }
  if (!marked) {
    if (last < now.day) kids.push(el("div", { class: "pd" }, label(now.day)));
    if (last <= now.day) mark();
  }
  box.replaceChildren(...kids);
  resizable(box, "plan");
}
// The marker moves on its own while the start page stays open.
setInterval(() => { if (plannerData && document.body.classList.contains("home")) drawPlanner(plannerData.text, plannerData.url, plannerData.opts); }, 60000);
// Drag the corner grip to resize a start page widget; the size is kept per widget.
function resizable(box, key) {
  const apply = (w, h) => {
    box.style.maxWidth = "none"; box.style.maxHeight = "none";
    box.style.width = Math.min(w, innerWidth - 32) + "px"; box.style.height = h + "px";
  };
  try {
    const s = JSON.parse(localStorage.getItem("size." + key));
    if (s && s.w >= 160 && s.h >= 80) apply(s.w, s.h);
  } catch (e) { /* no saved size */ }
  const g = el("div", { class: "grip", title: "Drag to resize" });
  g.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    g.setPointerCapture(ev.pointerId);
    const x0 = ev.clientX, y0 = ev.clientY, w0 = box.offsetWidth, h0 = box.offsetHeight;
    const k = box.dataset.pos === "right" ? -1 : box.dataset.pos === "below" ? 2 : 1;
    const move = (e) => apply(Math.max(160, w0 + k * (e.clientX - x0)), Math.max(80, h0 + e.clientY - y0));
    const up = () => {
      g.removeEventListener("pointermove", move);
      g.removeEventListener("pointerup", up);
      try { localStorage.setItem("size." + key, JSON.stringify({ w: box.offsetWidth, h: box.offsetHeight })); } catch (e) { /* storage full */ }
    };
    g.addEventListener("pointermove", move);
    g.addEventListener("pointerup", up);
  });
  box.append(g);
}
async function planner() {
  const r = await ask1({ type: "planner" });
  drawPlanner(r && r.text, r && r.url, r && r.opts);
}

// Notes widget on the start page: newest notes of the shared Notebook, switched in Settings, Start page.
async function notes() {
  const box = $("notes");
  const r = await ask1({ type: "notes" });
  if (!r || r.off) { box.replaceChildren(); return; }
  const kids = [el("h3", null, "Notes")];
  if (!r.items) kids.push(el("p", { class: "none" }, "Notes could not be loaded."));
  else if (!r.items.length) kids.push(el("p", { class: "none" }, "No notes yet. Open Notebook from the menu to add one."));
  else for (const n of r.items) kids.push(el("div", { class: "pe nt" }, el("b", null, n.title), n.more ? el("span", null, n.more) : null));
  box.replaceChildren(...kids);
  resizable(box, "notes");
}

run();
