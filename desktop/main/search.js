// Lodica Search pages (lodica://search/): results from the VPS search API, AI box answered locally.
const path = require("path");
const { ipcMain, net } = require("electron");
const relay = require("./relay");
const prefs = require("./prefs");

const PRELOAD = path.join(__dirname, "..", "preload", "search.js");
let ai = null, suggest = null, topSites = null;

function init(deps) {
  ai = deps.ai; suggest = deps.suggest; topSites = deps.topSites;
  for (const ses of deps.sessions) {
    try { ses.registerPreloadScript({ type: "frame", id: "lodica-search", filePath: PRELOAD }); } catch (e) { console.error("search preload", e.message); }
  }
  ipcMain.handle("search-msg", (e, msg) => {
    const url = e.senderFrame?.url || "";
    if (!url.startsWith("lodica://search/")) return undefined;
    return handle(msg);
  });
}

/** Query URL of the engine the start page should use; empty means Lodica Search itself. */
function engineQuery() {
  const want = prefs.p.search || (relay.available ? "LODICA" : "DUCKDUCKGO");
  if (want !== "LODICA") return prefs.ENGINES[want].query;
  return relay.available ? "" : prefs.ENGINES[prefs.p.searchFallback].query;
}

/** Where the planner and the notes sit on the start page: left, right or below the search bar. They never share a place. */
function positions() {
  const ok = (v) => v === "left" || v === "right" || v === "below";
  const plan = ok(prefs.p.plannerPos) ? prefs.p.plannerPos : "below";
  let notes = ok(prefs.p.notesPos) ? prefs.p.notesPos : "left";
  if (notes === plan) notes = ["left", "right", "below"].find((x) => x !== plan);
  return { plan, notes };
}

async function handle(msg) {
  if (!msg || typeof msg !== "object") return undefined;
  if (msg.type === "state") return { api: relay.available, engine: engineQuery(), base: relay.API, ai: !!prefs.p.ai && !!ai?.status().connected, aiAlways: !!prefs.p.aiAlways, theme: prefs.p.theme, custom: prefs.p.customTheme, bg: prefs.p.bg, quick: prefs.p.quickSites, hidden: prefs.p.quickHidden, auto: prefs.p.autoTop, pos: positions() };
  if (msg.type === "quick") return setQuick(msg.list);
  if (msg.type === "hide") {
    const h = String(msg.host || "").slice(0, 253);
    if (h) prefs.set("quickHidden", [...new Set([...(prefs.p.quickHidden || []), h])].slice(-200));
    return true;
  }
  if (msg.type === "planner") return planner();
  if (msg.type === "notes") return notes();
  if (msg.type === "auto") { prefs.set("autoTop", !!msg.on); return true; }
  if (msg.type === "search") return search(msg);
  if (msg.type === "ask") return ask(msg);
  if (msg.type === "suggest") return suggest ? suggest(String(msg.q || "").slice(0, 200)) : [];
  if (msg.type === "top") return topSites ? topSites() : [];
  if (msg.type === "icon") return icon(msg.h);
  return undefined;
}

// Smartschool planner: the ICS export is fetched here because the start page has no cross-origin access.
async function planner() {
  const url = String(prefs.p.plannerIcs || "").trim().replace(/^webcal:\/\//i, "https://");
  if (!/^https:\/\/[^\s]+$/.test(url)) return { url: "" };
  try {
    const r = await net.fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { url, text: null };
    return { url, text: (await r.text()).slice(0, 2e6) };
  } catch {
    return { url, text: null };
  }
}

// Notes widget on the start page: the newest notes of the shared notebook, first line as title.
async function notes() {
  if (prefs.p.startNotes === false || !relay.available) return { off: true };
  const nb = require("./notebook");
  const list = await nb.list();
  if (!list) return { items: null };
  const items = [];
  for (const n of list.slice(0, 5)) {
    const full = await nb.get(n.id);
    const lines = String(full ? full.text : "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    items.push({ title: (lines[0] || "Empty note").slice(0, 80), more: (lines[1] || "").slice(0, 120) });
  }
  return { items };
}

// Own shortcuts for the start page: up to 24 http(s) sites, each with an optional short name.
function setQuick(list) {
  if (!Array.isArray(list)) return false;
  const out = [];
  for (const it of list.slice(0, 24)) {
    try {
      const u = new URL(String(it && it.url || ""));
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      out.push({ url: u.href, title: String(it.title || "").slice(0, 40) });
    } catch {}
  }
  prefs.set("quickSites", out);
  return out;
}

async function search(msg) {
  if (!relay.available) return { error: "Lodica Search needs a linked server. Link one in Settings, or pick another search engine." };
  const qs = new URLSearchParams({ q: String(msg.q || ""), p: String(msg.p || 1) });
  if (msg.c) qs.set("c", String(msg.c));
  if (msg.l) qs.set("l", String(msg.l));
  try {
    const r = await fetch(relay.API + "/api/search?" + qs, { headers: { Authorization: "Bearer " + relay.token }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { error: "Search failed (" + r.status + ")" };
    return await r.json();
  } catch {
    return { error: "Search server unreachable" };
  }
}

// Site icons for the result circles. Fetched from the site itself (no third-party icon service), cached in memory.
const icons = new Map();
function icon(host) {
  host = String(host || "").toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { url: null };
  if (!icons.has(host)) icons.set(host, fetchIcon(host));
  return icons.get(host).then(url => ({ url }));
}
async function fetchIcon(host) {
  try {
    const r = await fetch("https://" + host + "/favicon.ico", { signal: AbortSignal.timeout(4000), redirect: "follow" });
    const type = (r.headers.get("content-type") || "").split(";")[0];
    if (!r.ok || !/^image\/(x-icon|vnd\.microsoft\.icon|png|svg\+xml|webp|gif|jpeg)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > 200000) return null;
    return "data:" + type + ";base64," + buf.toString("base64");
  } catch { return null; }
}

function ask(msg) {
  if (!ai || !prefs.p.ai || !ai.status().connected) return { error: "AI is not connected" };
  const q = String(msg.q || "").slice(0, 1000), ctx = String(msg.ctx || "").slice(0, 600);
  return Promise.race([
    ai.ask(q, ctx, Array.isArray(msg.history) ? msg.history.slice(-10) : []).catch(e => ({ error: e.message || "AI failed" })),
    new Promise(r => setTimeout(() => r({ error: "AI took too long" }), 90000)),
  ]);
}

module.exports = { init };
