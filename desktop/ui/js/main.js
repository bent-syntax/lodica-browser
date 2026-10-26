"use strict";
// Startup: init state from main, render the bar, subscribe to events, keyboard shortcuts.

function handleEscape() {
  const L = topLayer();
  if (L && !L.screen) return escTop();
  if (S.mode === "edit") { exitEdit(); return true; }
  if (S.mode === "find") { closeFind(); return true; }
  return false;
}

function runShortcut(name) {
  switch (name) {
    case "address": closeAll(true); enterEdit(); break;
    case "find": closeAll(true); openFind(); break;
    case "switcher": openSwitcher(!!S.tab.private); break;
    case "menu": openMenu(); break;
    case "escape": handleEscape(); break;
    case "settings": openSettings(); break;
    case "history": openHistory(); break;
    case "downloads": openDownloads(); break;
    case "notebook": if (NB.L) NB.L.close(); else if (S.relayAvail) openNotebook(); break;
  }
}

// main asks for a sheet by name.
function openSheet(d) {
  const name = d && d.name, data = (d && d.data) || {};
  const map = {
    reader: openReader, inbox: openInbox, history: openHistory, downloads: openDownloads,
    passwords: openPasswords, meter: openMeter, remind: openRemind, speed: openVideoSpeed,
    quality: openVideoQuality, closed: openClosed, memory: openAiMemory, menu: openMenu,
    settings: () => openSettings(data.section || (typeof data === "string" ? data : undefined)),
    switcher: () => openSwitcher(!!(data.private != null ? data.private : S.tab.private)),
    aichat: () => openAiChat(),
    ai: () => openAiAnswer(data.q || data.text || "", data.ctx || ""),
    preview: () => data.url && openPreview(data.url),
  };
  const fn = map[name];
  if (fn) fn(); else console.warn("unknown sheet", name);
}

function onTab(d) {
  if (!d) return;
  const prevId = S.tab && S.tab.id;
  S.tab = d;
  if (prevId !== d.id && S.mode === "find") closeFind(true);
  renderBar();
  refreshSwitcher();
  checkCrash();
  checkLock();
}

function onToast(d) {
  if (!d || !d.text) return;
  if (d.action && d.id != null) {
    let answered = false;
    toast({ text: d.text, ms: 8000, actions: [{ label: d.action, fn: () => { answered = true; inv("prompt.answer", d.id, true); } }],
      onGone: () => { if (!answered) inv("prompt.answer", d.id, false); } });
  } else toast(d.text);
}

function subscribe() {
  const on = (ev, fn) => window.lodica.on(ev, (d) => { try { fn(d); } catch (e) { console.warn("event " + ev, e); } });
  on("tab", onTab);
  on("tabs", (d) => { S.tabs = d || S.tabs; renderBar(); refreshSwitcher(); });
  on("find", (d) => { S.find = d || { cur: 0, total: 0 }; updateFindCount(); });
  on("toast", onToast);
  on("prompt", onPrompt);
  on("context", openContext);
  on("clipboard", onClipboard);
  on("mail", onMail);
  on("prefs", (d) => { if (d) S.prefs = Object.assign({}, d, { sysAccent: d.sysAccent || (S.prefs && S.prefs.sysAccent) }); loadKeys(); applyTheme(); refreshSettings(); renderBar(); });
  on("relay", (d) => { S.relay = Object.assign({}, S.relay, d || {}); refreshInbox(); refreshSettings(); });
  on("downloads", (list) => refreshDownloads(list));
  on("openRoom", (r) => { openRoom(); if (r) inv("room.select", r); });
  on("room", (d) => { ROOM.state = d || ROOM.state; if (ROOM.L) roomRender(); });
  on("ai.chats", (c) => { CHAT.chats = c || []; if (CHAT.L && !CHAT.busy) chatRender(); });
  on("ai", (d) => { S.ai = Object.assign({}, S.ai, d || {}); refreshSettings(); });
  on("shortcut", (d) => runShortcut(typeof d === "string" ? d : d && d.name));
  on("sheet", openSheet);
  on("overlay", onMainOverlay);
  on("locked", onLocked);
}

// Keys while the UI view has focus (page-focused keys arrive as "shortcut" events from main).
// The combo -> action map comes from main (rebindable) and is refreshed when prefs change.
const KEYS = { map: {}, ui: new Set(["address", "find", "switcher", "menu", "settings", "history", "downloads", "notebook"]) };
const loadKeys = () => inv("keys.list").then((r) => { if (r && r.map) KEYS.map = r.map; }).catch(() => {});
loadKeys();

const comboOf = (e) => {
  const k = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(k)) return "";
  const name = k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k;
  return [(e.ctrlKey || e.metaKey) && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", name].filter(Boolean).join("+");
};

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.isComposing) return; // already handled by an input (edit/find/dialog)
  if (e.key === "Escape") { if (handleEscape()) { e.preventDefault(); e.stopPropagation(); } return; }
  if (SET.capture && SET.capture(e)) return; // key-capture row in Settings → Keybinds
  const id = KEYS.map[comboOf(e)];
  if (!id) return;
  if (id === "closeTab" && topLayer()) return;
  e.preventDefault(); e.stopPropagation();
  if (KEYS.ui.has(id)) runShortcut(id); else inv("key.act", id);
});

const applyTheme = () => {
  const t = (S.prefs && S.prefs.theme) || "system";
  document.documentElement.dataset.theme = t;
  applyCustom(document.documentElement, t, S.prefs && S.prefs.customTheme, S.prefs && S.prefs.sysAccent);
  const a = Math.min(100, Math.max(30, (S.prefs && S.prefs.uiAlpha) || 100)) / 100;
  document.documentElement.style.setProperty("--ui-a", String(a));
  document.documentElement.style.setProperty("--ui-blur", S.prefs && S.prefs.uiBlur ? "18px" : "0px");
  const P = S.prefs || {}, bt = !P.barBottom;
  const side = P.vertTabs ? (P.vertCollapsed ? 44 : Math.min(480, Math.max(160, P.vertWidth || 220))) : 0;
  document.body.classList.toggle("bt", bt);
  document.documentElement.style.setProperty("--side", side + "px");
  document.documentElement.style.setProperty("--dock-y", (P.vertTabs ? 0 : 36) + "px");
  reportColors();
  applyPlugin();
};

// Community theme plugin: its variables and stylesheet go on top of the chosen theme.
let pluginVars = [], pluginKey = "";
const applyPlugin = async () => {
  const id = (S.prefs && S.prefs.themePlugin) || "";
  const p = id ? await inv("plugins.active") : null;
  const key = p ? JSON.stringify(p) : "";
  if (key === pluginKey) return;
  pluginKey = key;
  const root = document.documentElement;
  for (const k of pluginVars) root.style.removeProperty(k);
  pluginVars = p ? Object.keys(p.vars) : [];
  for (const k of pluginVars) root.style.setProperty(k, p.vars[k]);
  let el = document.getElementById("plugin-css");
  if (!el) { el = document.createElement("style"); el.id = "plugin-css"; document.head.append(el); }
  el.textContent = p ? p.css : "";
  reportColors();
};

// Tells main the theme's kite colors so the window icon follows the theme.
let lastColors = "";
const reportColors = () => requestAnimationFrame(() => {
  const cs = getComputedStyle(document.documentElement);
  const probe = document.createElement("i");
  const hex = v => { v = v.trim(); if (v && !v.startsWith("#")) { probe.style.color = v; document.body.append(probe); const r = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(getComputedStyle(probe).color); probe.remove(); if (r) v = "#" + [r[1], r[2], r[3]].map(n => (+n).toString(16).padStart(2, "0")).join(""); } const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim()); if (!m) return ""; const x = m[1]; return "#" + (x.length === 3 ? [...x].map(c => c + c).join("") : x); };
  const c = { bg: hex(cs.getPropertyValue("--bg")), amber: hex(cs.getPropertyValue("--amber")), text: hex(cs.getPropertyValue("--text")) };
  const k = JSON.stringify(c);
  if (!c.bg || !c.amber || !c.text || k === lastColors) return;
  lastColors = k;
  inv("theme.colors", c);
});

try { matchMedia("(prefers-color-scheme:light)").addEventListener("change", () => reportColors()); } catch {}

async function start() {
  const r = await inv("init");
  if (r) {
    for (const k of ["prefs", "engines", "agents", "languages", "version", "chromium", "ghostery"]) if (r[k] != null) S[k] = r[k];
    if (Array.isArray(r.qualities)) S.qualities = r.qualities;
    if (r.tab) S.tab = r.tab;
    if (r.tabs) S.tabs = r.tabs;
    if (r.ai) S.ai = Object.assign({}, S.ai, r.ai);
    S.relayAvail = !!(r.relay && r.relay.available);
    S.relay = Object.assign({}, S.relay, r.relay || {});
    S.locked = !!r.locked;
    S.pinSet = !!r.pinSet;
  }
  applyTheme();
  renderBar();
  subscribe();
  checkCrash();
  checkLock();
}
start();
