"use strict";
// Tab strip above the page (desktop only). Same bridge and commands as the bar.
const inv = (cmd, ...a) => window.lodica.invoke(cmd, ...a).catch(() => undefined);
const box = document.getElementById("tabs"), mailBtn = document.getElementById("mail");
let timer = 0, busy = false, again = false;
let vert = false, folded = false;
const foldBtn = document.getElementById("fold"), grip = document.getElementById("grip");
// Community theme plugin variables and stylesheet, same as the bar.
let pluginVars = [], pluginKey = "";
const applyPlugin = async (id) => {
  const pl = id ? await inv("plugins.active") : null;
  const key = pl ? JSON.stringify(pl) : "";
  if (key === pluginKey) return;
  pluginKey = key;
  const root = document.documentElement;
  for (const k of pluginVars) root.style.removeProperty(k);
  pluginVars = pl ? Object.keys(pl.vars) : [];
  for (const k of pluginVars) root.style.setProperty(k, pl.vars[k]);
  let el = document.getElementById("plugin-css");
  if (!el) { el = document.createElement("style"); el.id = "plugin-css"; document.head.append(el); }
  el.textContent = pl ? pl.css : "";
};
const applyPrefs = p => {
  document.documentElement.dataset.theme = (p && p.theme) || "system";
  applyCustom(document.documentElement, (p && p.theme) || "system", p && p.customTheme, p && p.sysAccent);
  applyPlugin((p && p.themePlugin) || "");
  document.documentElement.style.setProperty("--ui-a", "1");
  vert = !!(p && p.vertTabs); folded = vert && !!p.vertCollapsed;
  document.body.classList.toggle("vert", vert);
  document.body.classList.toggle("fold", folded);
  document.body.classList.toggle("bt", !(p && p.barBottom));
  foldBtn.classList.toggle("hidden", !vert);
  grip.classList.toggle("hidden", !vert);
  icon(foldBtn, folded ? PATHS.fwd : PATHS.back);
  foldBtn.title = folded ? "Expand panel" : "Collapse panel";
  soon();
};
const backBtn = document.getElementById("back"), fwdBtn = document.getElementById("fwd"), relBtn = document.getElementById("rel");
const PATHS = {
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  fwd: "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  rel: "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  stop: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
};
function icon(btn, path) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
  svg.setAttribute("viewBox", "0 0 24 24");
  p.setAttribute("d", path);
  svg.append(p);
  btn.replaceChildren(svg);
}
icon(backBtn, PATHS.back); icon(fwdBtn, PATHS.fwd); icon(relBtn, PATHS.rel);
let loadingNow = false;
function navState(c) {
  backBtn.disabled = !(c && c.canBack);
  fwdBtn.disabled = !(c && c.canForward);
  const l = !!(c && c.loading);
  if (l !== loadingNow) {
    loadingNow = l;
    icon(relBtn, l ? PATHS.stop : PATHS.rel);
    relBtn.title = l ? "Stop" : "Reload (F5)";
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function render(tabs) {
  const keep = box.scrollLeft;
  box.replaceChildren(...tabs.map(t => {
    const locked = t.private && t.locked;
    const row = el("div", "t" + (t.current ? " cur" : "") + (t.private ? " priv" : "") + (t.split ? " split" : ""));
    row.title = locked ? "Private tab (locked)" : (t.title || t.url || "");
    const name = locked ? "Private" : (t.home ? "New tab" : (t.title || t.url));
    let fav;
    if (t.icon && !locked) {
      fav = el("img", "fv");
      fav.src = t.icon; fav.alt = "";
      fav.addEventListener("error", () => fav.replaceWith(el("span", "fl", ([...(name || "?")][0] || "?").toUpperCase())));
    } else fav = el("span", "fl", ([...(name || "?")][0] || "?").toUpperCase());
    row.append(fav, el("span", "l", name));
    const x = el("button", "x", "×");
    x.title = "Close tab";
    x.addEventListener("click", e => { e.stopPropagation(); inv("tab.close", t.id); });
    row.append(x);
    dragTab(row, t.id);
    row.addEventListener("click", () => inv("tab.select", t.id));
    row.addEventListener("auxclick", e => { if (e.button === 1) inv("tab.middle", t.id); });
    row.addEventListener("contextmenu", e => { e.preventDefault(); inv("tab.menu", t.id); });
    return row;
  }));
  box.scrollLeft = keep;
  box.querySelector(".cur")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

async function refresh() {
  if (busy) { again = true; return; }
  busy = true;
  try {
    const list = await inv("tab.list");
    if (!list?.tabs) return;
    render(list.tabs);
    const c = list.tabs.find(t => t.current);
    navState(c);
    mailBtn.classList.toggle("hidden", !(c && c.emailForm && !c.locked));
  } finally { busy = false; if (again) { again = false; refresh(); } }
}
const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 80); };

window.lodica.on("tab", t => {
  if (t && t.current !== false) navState(t);
  mailBtn.classList.toggle("hidden", !(t && t.emailForm && !t.locked));
  soon();
});
window.lodica.on("tabs", soon);
// Update progress: the download is exact, the install is an estimate (the setup runs silently and restarts Lodica when done).
{
  const box = document.getElementById("upd"), label = document.getElementById("updt"), bar = document.getElementById("updb");
  window.lodica.on("update", u => {
    const st = u && u.state, v = u && u.version ? " " + u.version : "";
    const down = st === "downloading", inst = st === "installing";
    box.classList.toggle("hidden", !(down || inst));
    if (!(down || inst)) return;
    // download is the first 70% of the bar, the install the rest
    const frac = down ? 0.7 * (u.size ? Math.min(1, (u.received || 0) / u.size) : 0) : 0.7 + 0.3 * (u.progress || 0);
    box.classList.remove("busy");
    bar.style.width = Math.round(frac * 100) + "%";
    label.textContent = (down ? "Downloading" + v + " " : "Installing" + v + ", Lodica restarts when done ") + Math.round(frac * 100) + "%";
  });
}
window.lodica.on("locked", soon);
document.getElementById("add").addEventListener("click", () => inv("tab.new", {}));
backBtn.addEventListener("click", () => inv("back"));
fwdBtn.addEventListener("click", () => inv("forward"));
relBtn.addEventListener("click", e => inv(loadingNow ? "stop" : "reload", e.shiftKey));
mailBtn.addEventListener("click", () => inv("email.fill"));
foldBtn.addEventListener("click", () => inv("prefs.set", "vertCollapsed", !folded));
let gripRaf = 0;
grip.addEventListener("pointerdown", e => { grip.setPointerCapture(e.pointerId); grip.classList.add("on"); });
grip.addEventListener("pointermove", e => {
  if (!grip.hasPointerCapture(e.pointerId)) return;
  const x = e.clientX;
  cancelAnimationFrame(gripRaf);
  gripRaf = requestAnimationFrame(() => {
    if (x < 100) { if (!folded) inv("prefs.set", "vertCollapsed", true); return; }
    const w = Math.round(Math.min(480, Math.max(160, x)));
    inv("prefs.set", "vertWidth", w);
    if (folded) inv("prefs.set", "vertCollapsed", false);
  });
});
grip.addEventListener("pointerup", e => { grip.releasePointerCapture(e.pointerId); grip.classList.remove("on"); });
inv("prefs.all").then(applyPrefs);
window.lodica.on("prefs", applyPrefs);
refresh();

// Links and images dragged out of a page open in a new tab when dropped on the tab strip.
const dropUrl = dt => {
  const raw = (dt.getData("text/uri-list") || dt.getData("text/plain") || "").split(/\r?\n/).find(l => l && !l.startsWith("#")) || "";
  return /^https?:\/\//i.test(raw.trim()) ? raw.trim() : "";
};
document.addEventListener("dragover", e => {
  if (e.dataTransfer && [...e.dataTransfer.types].some(t => t === "text/uri-list" || t === "text/plain")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
});
document.addEventListener("drop", e => {
  const u = e.dataTransfer && dropUrl(e.dataTransfer);
  if (!u) return;
  e.preventDefault();
  inv("tab.new", { url: u });
});
