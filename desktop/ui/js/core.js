"use strict";
// Shared state, IPC wrapper, DOM builder, click delegation, label helpers.
const S = {
  prefs: {}, engines: {}, agents: {}, languages: {}, qualities: [144, 240, 360, 480, 720, 1080, 1440, 2160],
  tab: { home: true, display: "" }, tabs: { count: 1, privateCount: 0 },
  version: "", chromium: "", ghostery: "", relay: { available: false }, ai: { status: "Off", connected: false },
  locked: false, pinSet: false, mode: "main", find: { cur: 0, total: 0 }, crashedDismissed: null,
};

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

async function inv(cmd, ...args) {
  try { return await window.lodica.invoke(cmd, ...args); }
  catch (e) { console.warn("invoke failed", cmd, e && e.message); return undefined; }
}

// Click delegation: one document listener, handlers stored per element.
const ACT = new WeakMap();
document.addEventListener("click", (e) => {
  for (let n = e.target; n && n !== document; n = n.parentNode) {
    const fn = ACT.get(n);
    if (fn) { if (n.disabled) return; e.stopPropagation(); fn(e, n); return; }
  }
});

// h(tag, attrs, ...children). attrs: class, text, act (click), on:{evt:fn}, style, data:{}, any attribute.
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "act") ACT.set(el, v);
    else if (k === "on") for (const ev in v) el.addEventListener(ev, v[ev]);
    else if (k === "style") el.style.cssText = v;
    else if (k === "data") Object.assign(el.dataset, v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// Icon button.
function ib(icon, title, act, cls) {
  return h("button", { class: "ib" + (cls ? " " + cls : ""), title, "aria-label": title, act }, ico(icon));
}
function btn(text, act, cls) { return h("button", { class: "btn" + (cls ? " " + cls : ""), act }, text); }
function toggleEl(on) { return h("span", { class: "sw-t" + (on ? " on" : "") }); }

// engines/agents/languages may arrive as {KEY:{label}|"label"} or [{key|id|value, label|name}] or [label].
function optList(src) {
  if (!src) return [];
  if (Array.isArray(src)) return src.map((o, i) => typeof o === "string" ? { key: o, label: o } :
    { key: o.key ?? o.id ?? o.value ?? o.name ?? String(i), label: o.label ?? o.name ?? o.title ?? String(o.key ?? i) });
  return Object.keys(src).map((k) => ({ key: k, label: typeof src[k] === "string" ? src[k] : (src[k] && (src[k].label || src[k].name)) || k }));
}
function optLabel(src, key) { const o = optList(src).find((x) => x.key === key); return o ? o.label : (key || ""); }
const engineLabel = () => optLabel(S.engines, S.prefs.search || "DUCKDUCKGO") || "DuckDuckGo";

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u || ""; } }
function fmtBytes(n) {
  n = +n || 0;
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"]; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 100 ? n.toFixed(0) : n.toFixed(1)) + " " + u[i];
}
function fmtNum(n) { return (+n || 0).toLocaleString("en-US"); }
function fmtTime(t) {
  if (!t) return "";
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return hm;
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + hm;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const sameTabPrivacy = () => !!S.tab.private;
