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
let hasApi = null, engine = "";
const lang = (navigator.language || "").slice(0, 2).toLowerCase();

// Colours come from the app theme through the helper; without them the stylesheet defaults apply.
function applyTheme(t) {
  if (!t || typeof t !== "object") return;
  window.lodicaApplyTheme(t);
  try { localStorage.setItem("lodica.theme", JSON.stringify(t)); } catch (e) {}
}

// The logo goes to the app's own start page (about:blank), not this extension page.
document.querySelector(".brand").href = "about:blank";

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
  if (params.get("th")) s.set("th", params.get("th"));
  return "search.html?" + s;
}

// Only http(s) links are rendered; anything else from the index is dropped.
function safe(u) {
  try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:" ? x.href : null; } catch (e) { return null; }
}

function img(src, cls, alt) {
  if (!src) return null;
  // The proxy can answer too early on a first load: try again a few times before giving up.
  let tries = 0;
  const i = el("img", { src: BASE + src, class: cls, alt: alt || "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  i.addEventListener("error", () => {
    if (++tries > 3) { i.classList.add("broken"); return; }
    setTimeout(() => { i.src = BASE + src + (src.includes("?") ? "&" : "?") + "r=" + tries; }, 400 * tries);
  });
  return i;
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
    $("edit").textContent = editing ? "Done" : "+";
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
browser.runtime.sendMessage({ type: "state" }).then((st) => { hasApi = !!(st && st.api); engine = (st && st.engine) || ""; applyTheme(st && st.theme); }, () => {});

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
    // Read the chosen engine fresh: the initial state load may not have finished yet.
    const st = await browser.runtime.sendMessage({ type: "state" }).catch(() => null);
    let fb = "";
    if (st) { hasApi = !!st.api; engine = st.engine || ""; fb = st.fallback || ""; }
    // The engine chosen in Settings wins; Lodica Search is only used when it is the chosen engine.
    if (engine) { location.href = engine.replace("%s", encodeURIComponent(v)); return; }
    // Without a relay there is no search API, so the question goes to the fallback engine instead.
    if (hasApi === false) location.href = (fb || "https://duckduckgo.com/?q=%s").replace("%s", encodeURIComponent(v));
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
    if (!priv) { planner(); notes(); }
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
    el("div", { class: "cap" }, x.t || "", el("a", { href: u }, "Visit " + (x.h || "page")),
      el("a", { href: safe(x.f || x.i) || u }, "Open image")),
    el("button", { id: "vclose", "aria-label": "Close" }, "\u2715"));
  v.querySelector("#vclose").addEventListener("click", () => v.remove());
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
    const msg = el("div", { class: "ans" }, (data && data.error) || "Search unavailable");
    if (st && st.api === false) {
      const fb = (st.engine || st.fallback || "https://duckduckgo.com/?q=%s").replace("%s", encodeURIComponent(q));
      msg.append(" ", el("a", { href: fb }, "Search with the fallback engine"));
    }
    $("results").replaceChildren(msg);
    return;
  }
  if (!cached) cachePut({ data });
  note(data);
  if (cat === "images") renderImages(data); else renderWeb(data);
  renderPages(data);
  if (!(data.results || []).length) $("results").append(el("div", { class: "ans" }, "No results for “" + q + "”."));
  if (cached && cached.y) requestAnimationFrame(() => scrollTo(0, cached.y));
  const state = await statePromise;
  // Results are already on screen, so never bounce to another engine here: api can read false only because
  // the app's config had not arrived yet.
  // Private tabs never send the question to the AI.
  applyTheme(state && state.theme);
  if (state && state.ai && !cat && page === 1 && !priv) {
    if (state.aiAlways || (cached && cached.ai)) ask(data, cached && cached.ai);
    else askButton(data);
  }
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
let plannerData = null;
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
    return { day: s.day, min: s.min, endDay: f.day, end: f.min, allDay: e.allDay, title: e.title || "Untitled", where: e.where, subject: sub ? sub[1].trim() : "", kind: kindOf(e.title || "") };
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
    if (e.day === now.day && !marked && !e.allDay && e.min > now.min) mark();
    const main = e.kind === "lesson" && e.subject ? e.subject : e.title;
    const more = e.kind !== "lesson" && e.subject ? " · " + e.subject : "";
    const cls = "pe" + (opts.colors !== false && e.kind !== "lesson" ? " " + e.kind : "");
    kids.push(el("div", { class: cls }, el("b", null, e.allDay ? "All day" : hhmm(e.min)), el("span", null, main + more), e.where ? el("em", null, e.where) : null));
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
// Planner and notes sit left, right or below the search bar (Settings). Side places need a wide screen.
function place(id, where, fallback) {
  $(id).dataset.pos = where || fallback;
}
async function planner() {
  const st = await browser.runtime.sendMessage({ type: "state" }).catch(() => null);
  place("plan", st && st.pos && st.pos.plan, "below");
  const url = st && st.planner || "";
  let text = null;
  if (url) text = await fetch(url).then((r) => (r.ok ? r.text() : null)).catch(() => null);
  drawPlanner(text, url, st && st.plannerOpts);
}

// Newest Notebook notes on the start page, read through the app. Hidden when the Settings toggle is off or no server is linked.
async function notes() {
  const box = $("notes");
  const st = await browser.runtime.sendMessage({ type: "state" }).catch(() => null);
  place("notes", st && st.pos && st.pos.notes, "left");
  if (!st || !st.notes) { box.replaceChildren(); return; }
  const items = await browser.runtime.sendMessage({ type: "notes" }).catch(() => []);
  const kids = [el("h3", null, "Notes")];
  if (!items || !items.length) kids.push(el("p", { class: "none" }, "No notes yet. Open Notebook from the menu to add one."));
  else for (const n of items) kids.push(el("div", { class: "pe nt" }, el("b", null, n.title), n.more ? el("span", null, n.more) : null));
  box.replaceChildren(...kids);
  resizable(box, "notes");
}

run();
