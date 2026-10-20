// Tabs: one WebContentsView per tab, created lazily on select, discarded when idle.
const path = require("path");
const crypto = require("crypto");
const { WebContentsView, session, shell } = require("electron");
const store = require("./store");
const prefs = require("./prefs");
const relay = require("./relay");
const history = require("./history");
const errorpage = require("./errorpage");

const HOME = "lodica://search/search.html";
const PRELOAD = path.join(__dirname, "..", "preload", "content.js");
const IDLE_MS = 10 * 60 * 1000;
const MAX_CLOSED = 10;

let deps = null, win = null, cur = null, locked = false;
let list = [];
let closed = []; // newest first: {title,url,entries,index,private}

const privSession = () => session.fromPartition("lodica-private");
const hostOf = u => { try { return new URL(u).hostname; } catch { return ""; } };
/** The own domain name (custom DNS rule) that points at this host, so the bar shows the name the user typed. */
function ownNameFor(host) {
  const rules = prefs.p.dnsRules;
  if (!host || !Array.isArray(rules)) return "";
  const h = host.toLowerCase();
  const r = rules.find(r => {
    const from = String(r && r.from || "").trim().toLowerCase(), to = String(r && r.to || "").trim();
    return from && !from.startsWith("*") && !from.startsWith(".") && hostOf(/^https?:\/\//i.test(to) ? to : "http://" + to).toLowerCase() === h;
  });
  return r ? String(r.from).trim() : "";
}
const alive = t => !!t.view && !t.view.webContents.isDestroyed();
const isHome = u => !u || u === "about:blank" || (u.startsWith(HOME) && !/[?&]q=/.test(u));

function make(o = {}) {
  return {
    id: o.id || crypto.randomUUID(), url: o.url || HOME, title: o.title || "", lastUsed: o.lastUsed || Date.now(),
    archived: !!o.archived, entries: o.entries || [], index: o.index, private: !!o.private, view: null,
    host: hostOf(o.url), blocked: 0, audio: false, crashed: false, loading: false, progress: 0,
    desktop: prefs.p.desktopDefault, emailForm: false, emailFocus: false, icons: [], thumb: null,
  };
}

function persist() {
  store.save("tabs", () => ({
    current: cur && !cur.private ? cur.id : null,
    tabs: list.filter(t => !t.private).map(t => ({ id: t.id, url: t.url, title: t.title, lastUsed: t.lastUsed, archived: t.archived, entries: t.entries, index: t.index })),
    closed: closed.filter(c => !c.private),
  }), 1000);
  deps?.onChange?.();
}

function snapshot(t) {
  if (!alive(t)) return;
  const nh = t.view.webContents.navigationHistory;
  try {
    t.entries = nh.getAllEntries().filter(e => e.url && !e.url.startsWith("devtools:"));
    t.index = Math.min(nh.getActiveIndex(), t.entries.length - 1);
  } catch { /* view going away */ }
}

function byContents(wc) { return wc ? list.find(t => t.view && t.view.webContents === wc) || null : null; }
function all() { return list; }
function current() { return cur; }
function open() { return list.filter(t => !t.archived); }

function info(t) {
  if (!t) return null;
  const wc = alive(t) ? t.view.webContents : null;
  const nh = wc?.navigationHistory;
  const home = isHome(t.url);
  const q = prefs.searchQuery(t.url);
  return {
    id: t.id, url: t.url, display: home ? "" : (q ?? t.url), title: t.title || (home ? "New tab" : t.url),
    loading: t.loading, progress: t.progress, canBack: !!nh?.canGoBack(), canForward: !!nh?.canGoForward(),
    private: t.private, host: t.host, https: t.url.startsWith("https://") || t.url.startsWith("lodica://"),
    blocked: t.blocked, trusted: prefs.isTrusted(t.host), lite: prefs.isLite(t.host), compat: prefs.isCompat(t.host),
    desktop: t.desktop, emailForm: t.emailForm, emailFocus: t.emailFocus, routed: relay.routed(t.url),
    audio: t.audio, speed: prefs.p.speed, quality: prefs.qualityFor(t.host) ?? prefs.p.quality,
    origin: home ? "" : (ownNameFor(t.host) || (prefs.p.showRedirectOrigin ? t.origin || "" : "")),
    split: inSplit(t), crashed: t.crashed, locked: locked && t.private, home, lastUsed: t.lastUsed, archived: t.archived,
  };
}

function pushTab(t) { if (t && t === cur) deps.ui.push("tab", info(t)); }
function pushCount() {
  const o = open();
  deps.ui.push("tabs", { count: o.filter(t => !t.private).length, privateCount: o.filter(t => t.private).length });
}

function createView(t) {
  const view = new WebContentsView({
    webPreferences: {
      preload: PRELOAD, sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: true,
      session: t.private ? privSession() : session.defaultSession,
      additionalArguments: t.private ? ["--lodica-private"] : [],
    },
  });
  view.setBackgroundColor("#ffffff");
  t.view = view;
  t.crashed = false;
  wire(t, view.webContents);
  deps.onView?.(t, view.webContents);
  const wc = view.webContents;
  if (t.entries.length) {
    const index = Number.isInteger(t.index) && t.index >= 0 && t.index < t.entries.length ? t.index : undefined;
    wc.navigationHistory.restore({ entries: t.entries, index }).catch(() => {});
  } else wc.loadURL(pdfViewerUrl(t.url) || t.url).catch(() => {});
}

// Main-frame links to a .pdf open in the bundled viewer instead of Chromium's. A .docx is converted to a PDF first.
function pdfViewerUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^(https?|file):$/.test(u.protocol) || !/\.(pdf|docx)$/i.test(u.pathname)) return null;
  const file = (/\.docx$/i.test(u.pathname) ? "lodica://pdf/docx?u=" : "lodica://pdf/f?u=") + encodeURIComponent(url);
  return "lodica://pdf/web/viewer.html?file=" + encodeURIComponent(file);
}

function wire(t, wc) {
  // window.open with features (or a blank target, like mail composers) gets a real top-level window with a live
  // opener, as in other browsers. Denying it returns null to the page, which hangs sites such as Smartschool.
  const handleOpen = ({ url, disposition }) => {
    if (disposition === "new-window" || !url || url === "about:blank") {
      return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: "#ffffff", width: 900, height: 700 } };
    }
    if (/^(https?|lodica):/i.test(url)) create({ url, private: t.private, background: disposition === "background-tab" });
    return { action: "deny" };
  };
  const adopt = (src, owner) => {
    src.setWindowOpenHandler(handleOpen);
    src.on("did-create-window", win => {
      win.setMenuBarVisibility(false);
      adopt(win.webContents, owner);
      owner.once("destroyed", () => { if (!win.isDestroyed()) win.close(); });
    });
  };
  adopt(wc, wc);
  wc.on("focus", () => focusPane(t));
  wc.on("page-favicon-updated", (_, favicons) => { t.icons = Array.isArray(favicons) ? favicons.slice(0, 8) : []; });
  wc.on("page-title-updated", (_, title) => {
    t.title = title;
    if (!t.private) history.title(t.url, title);
    persist(); pushTab(t);
  });
  wc.on("did-start-navigation", d => {
    if (d.isMainFrame && !d.isSameDocument) t.navStart = d.url;
  });
  wc.on("did-navigate", (_, navUrl) => {
    const isErr = errorpage.isErrorUrl(navUrl);
    const url = isErr ? errorpage.failedOf(navUrl) || t.url : navUrl;
    Object.assign(t, { url, host: hostOf(url), blocked: 0, emailForm: false, emailFocus: false, icons: [], crashed: false, failUrl: isErr ? url : null });
    const from = t.navStart ? hostOf(t.navStart) : "";
    t.origin = !isErr && /^https?:/i.test(t.navStart || "") && from && from !== t.host ? from : "";
    t.navStart = null;
    snapshot(t);
    if (!t.private && !isErr) history.add(url);
    persist(); pushTab(t);
  });
  wc.on("did-navigate-in-page", (_, url, isMainFrame) => {
    if (!isMainFrame) return;
    t.url = url; t.host = hostOf(url);
    t.origin = "";
    snapshot(t);
    if (!t.private) history.add(url, t.title);
    persist(); pushTab(t);
  });
  wc.on("did-start-loading", () => { t.loading = true; t.progress = 0.1; pushTab(t); });
  wc.on("dom-ready", () => { t.progress = 0.7; pushTab(t); });
  wc.on("did-stop-loading", () => { t.loading = false; t.progress = 1; snapshot(t); pushTab(t); });
  wc.on("did-fail-load", (_, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    t.loading = false; t.progress = 1;
    if (!errorpage.isErrorUrl(url) && !errorpage.isActionUrl(url) && /^(https?|file):/i.test(url)) {
      errorpage.crashLog({ kind: "load-failed", reason: desc + " (" + code + ")", url });
      setImmediate(() => { if (!wc.isDestroyed()) wc.loadURL(errorpage.url(code, desc, url)).catch(() => {}); });
    } else if (t === cur) deps.ui.toast("Could not load page (" + desc + ")");
    pushTab(t);
  });
  const toViewer = e => {
    const v = pdfViewerUrl(e.url);
    if (!v) return false;
    e.preventDefault();
    wc.loadURL(v).catch(() => {});
    return true;
  };
  wc.on("will-redirect", toViewer);
  wc.on("will-navigate", e => {
    if (toViewer(e)) return;
    if (!errorpage.isActionUrl(e.url)) return;
    e.preventDefault();
    const { action, url } = errorpage.parseAction(e.url);
    if (!/^(https?|file):/i.test(url)) return;
    if (action === "retry") wc.loadURL(url).catch(() => {});
    else if (action === "noblock") { t.noBlock = hostOf(url); wc.loadURL(url).catch(() => {}); }
    else if (action === "external" && /^https?:/i.test(url)) shell.openExternal(url);
  });
  wc.on("render-process-gone", (_, details) => {
    const reason = details?.reason || "unknown";
    errorpage.crashLog({ kind: "render-process-gone", reason, exitCode: details?.exitCode, url: t.url });
    if (reason === "clean-exit") return;
    t.loading = false;
    const now = Date.now();
    t.crashTimes = (t.crashTimes || []).filter(x => now - x < 60000);
    t.crashTimes.push(now);
    if (t.crashTimes.length > 3) { t.crashed = true; pushTab(t); return; }
    // Auto-reload; the window itself is unaffected by a tab's renderer dying.
    setImmediate(() => {
      if (wc.isDestroyed()) return;
      try { wc.reload(); } catch { t.crashed = true; }
      pushTab(t);
    });
    t.crashed = true;
    pushTab(t);
  });
  wc.on("media-started-playing", () => { t.audio = true; pushTab(t); });
  wc.on("media-paused", () => { t.audio = false; pushTab(t); });
  wc.on("context-menu", (_, p) => {
    if (t !== cur) return;
    deps.ui.push("context", {
      x: p.x, y: p.y, linkURL: p.linkURL, srcURL: p.srcURL, mediaType: p.mediaType,
      selectionText: p.selectionText, editable: p.isEditable,
    });
  });
  wc.on("found-in-page", (_, r) => { if (t === cur) deps.ui.push("find", { cur: r.activeMatchOrdinal, total: r.matches }); });
}

function capture(t) {
  if (!alive(t) || t.crashed) return Promise.resolve(t.thumb);
  return t.view.webContents.capturePage()
    .then(img => { if (!img.isEmpty()) t.thumb = img.resize({ width: 320 }).toDataURL(); return t.thumb; })
    .catch(() => t.thumb);
}

let shown = null;
// Split view: two tabs side by side. `a` is the left pane, `b` the right one.
let split = null; // { a: tabId, b: tabId, ratio }
let shownOther = null, dividerOn = false;
const GAP = 14;

function inSplit(t) { return !!split && !!t && (t.id === split.a || t.id === split.b); }
function partner() {
  if (!split || !cur || !inSplit(cur)) return null;
  const id = cur.id === split.a ? split.b : split.a;
  const t = list.find(x => x.id === id);
  return t && !t.archived && t.private === cur.private ? t : null;
}

function splitRects() {
  const r = deps.ui.pageBounds();
  const w = Math.max(0, r.width - GAP), left = Math.round(w * split.ratio);
  return {
    a: { x: r.x, y: r.y, width: left, height: r.height },
    gap: { x: r.x + left, y: r.y, width: GAP, height: r.height },
    b: { x: r.x + left + GAP, y: r.y, width: w - left, height: r.height },
  };
}

function place() {
  if (!shown) return;
  if (!shownOther) { shown.setBounds(deps.ui.pageBounds()); return; }
  const rc = splitRects();
  const curIsA = cur.id === split.a;
  shown.setBounds(curIsA ? rc.a : rc.b);
  shownOther.setBounds(curIsA ? rc.b : rc.a);
  deps.divider?.setBounds(rc.gap);
}

function show() {
  const want = cur && alive(cur) && !(locked && cur.private) ? cur.view : null;
  const mate = want ? partner() : null;
  if (mate && !alive(mate)) createView(mate);
  const other = mate && alive(mate) ? mate.view : null;
  for (const v of [shown, shownOther]) {
    if (v && v !== want && v !== other) { try { win.contentView.removeChildView(v); } catch { /* destroyed */ } }
  }
  shown = want; shownOther = other;
  if (other) win.contentView.addChildView(other);
  if (want) win.contentView.addChildView(want);
  if (deps.divider) {
    if (other && !dividerOn) { win.contentView.addChildView(deps.divider); dividerOn = true; }
    if (!other && dividerOn) { try { win.contentView.removeChildView(deps.divider); } catch { /* gone */ } dividerOn = false; }
    if (other) win.contentView.addChildView(deps.divider);
  }
  place();
  deps.raise();
}

function fit() { place(); }

function endSplit() {
  if (!split) return false;
  split = null;
  show(); pushCount(); pushTab(cur);
  return true;
}

/** Pair the current tab with another one (default: the most recently used). */
function splitWith(id) {
  if (!cur || cur.private && locked) return false;
  let mate = id ? list.find(x => x.id === id && !x.archived) : neighbor(cur);
  if (!mate || mate === cur || mate.private !== cur.private) {
    if (id) return false;
    create({ private: cur.private, background: true });
    mate = list[list.indexOf(cur) + 1];
    if (!mate) return false;
  }
  split = { a: cur.id, b: mate.id, ratio: 0.5 };
  show(); pushCount(); pushTab(cur); persist();
  return true;
}

function toggleSplit() { return split ? endSplit() : splitWith(); }

function setSplitRatio(r) {
  if (!split || !Number.isFinite(r)) return false;
  split.ratio = Math.min(0.85, Math.max(0.15, r));
  place();
  return true;
}

/** Called when a pane gets keyboard focus (a click inside it). */
function focusPane(t) {
  if (!inSplit(t) || !inSplit(cur) || t === cur) return;
  select(t.id);
}

function destroy(t) {
  if (!t.view) return;
  snapshot(t);
  const v = t.view;
  t.view = null; t.audio = false; t.loading = false;
  if (shown === v) { try { win.contentView.removeChildView(v); } catch { /* gone */ } shown = null; }
  if (shownOther === v) { try { win.contentView.removeChildView(v); } catch { /* gone */ } shownOther = null; }
  try { if (!v.webContents.isDestroyed()) v.webContents.close(); } catch { /* gone */ }
}

function select(id) {
  const t = list.find(x => x.id === id);
  if (!t) return null;
  if (t.archived) t.archived = false;
  const prev = cur;
  if (prev && prev !== t) capture(prev);
  cur = t;
  t.lastUsed = Date.now();
  // Leaving a private tab for a normal one locks private tabs again.
  const relock = !!prev && prev.private && !t.private && !locked;
  if (relock) locked = true;
  if (!alive(t) && !(locked && t.private)) createView(t);
  show();
  if (relock) deps.ui.push("locked", { on: list.some(x => x.private && !x.archived) });
  if (shown) shown.webContents.focus();
  deps.ui.push("find", { cur: 0, total: 0 });
  pushTab(t); pushCount(); persist();
  return info(t);
}

function create(o = {}) {
  // A first private tab has nothing to protect, so it opens unlocked.
  if (o.private && !list.some(x => x.private && !x.archived)) locked = false;
  const t = make({ url: o.url || HOME, private: !!o.private });
  list.push(t); // new tabs always open rightmost
  if (o.background) {
    createView(t);
    pushCount(); persist();
    deps.ui.toast("Opened in background");
    return info(t);
  }
  return select(t.id);
}

function neighbor(t) {
  const o = open().filter(x => x !== t);
  const same = o.filter(x => x.private === t.private);
  const pool = same.length ? same : o;
  return pool.sort((a, b) => b.lastUsed - a.lastUsed)[0] || null;
}

function close(id) {
  const t = list.find(x => x.id === (id ?? cur?.id));
  if (!t) return false;
  snapshot(t);
  if (!isHome(t.url)) {
    closed.unshift({ title: t.title, url: t.url, entries: t.entries, index: t.index, private: t.private });
    closed = closed.slice(0, MAX_CLOSED);
  }
  deps.helper?.forgetTab(t);
  const wasSplit = inSplit(t);
  if (wasSplit) split = null;
  destroy(t);
  list = list.filter(x => x !== t);
  if (wasSplit && cur !== t) show();
  if (cur === t) {
    cur = null;
    const n = neighbor(t);
    if (n) select(n.id); else create({});
  }
  pushCount(); persist();
  return true;
}

function reopen(index = 0) {
  const c = closed[index];
  if (!c) return null;
  closed.splice(index, 1);
  const t = make({ url: c.url, title: c.title, entries: c.entries, index: c.index, private: c.private });
  list.push(t);
  return select(t.id);
}
const undoClose = () => reopen(0);

// Put tab `id` where tab `toId` is now.
function move(id, toId) {
  const a = list.findIndex(x => x.id === id), b = list.findIndex(x => x.id === toId);
  if (a < 0 || b < 0 || a === b) return false;
  const [t] = list.splice(a, 1);
  list.splice(b, 0, t);
  pushCount(); persist();
  return true;
}

function closeAll(priv) {
  for (const t of list.filter(x => x.private === !!priv && !x.archived)) {
    if (inSplit(t)) split = null;
    deps.helper?.forgetTab(t);
    destroy(t);
  }
  list = list.filter(x => !(x.private === !!priv && !x.archived));
  if (priv) closed = closed.filter(c => !c.private);
  if (!cur || !list.includes(cur)) {
    cur = null;
    const n = open().sort((a, b) => b.lastUsed - a.lastUsed)[0];
    if (n) select(n.id); else create({});
  }
  pushCount(); persist();
  return true;
}

function archive(id) {
  const t = list.find(x => x.id === id);
  if (!t || t.private) return false;
  snapshot(t);
  if (inSplit(t)) split = null;
  destroy(t);
  t.archived = true;
  if (cur === t) {
    cur = null;
    const n = neighbor(t);
    if (n) select(n.id); else create({});
  }
  pushCount(); persist();
  return true;
}

function restore(id) { return select(id) ? true : false; }

function deleteArchived(id) {
  const n = list.length;
  list = list.filter(x => !(x.id === id && x.archived));
  persist();
  return list.length !== n;
}
function clearArchived() { list = list.filter(x => !x.archived); persist(); return true; }

function autoArchive(days) {
  if (!days || days <= 0) return 0;
  const cut = Date.now() - days * 86400000;
  const old = list.filter(t => !t.archived && !t.private && t !== cur && !inSplit(t) && t.lastUsed < cut);
  for (const t of old) { destroy(t); t.archived = true; }
  if (old.length) { pushCount(); persist(); }
  return old.length;
}

function listing() {
  const byRecent = (a, b) => b.lastUsed - a.lastUsed;
  return {
    tabs: open().map(t => ({ ...info(t), current: t === cur, icon: (t.icons && t.icons[0]) || null })),
    archived: list.filter(t => t.archived).sort(byRecent).map(info),
    closed: closed.map(c => ({ title: c.title || c.url, url: c.url })),
  };
}

async function thumb(id) {
  const t = list.find(x => x.id === id);
  if (!t) return null;
  if (t === cur) await capture(t);
  return t.thumb || null;
}

function discardIdle() {
  const cut = Date.now() - IDLE_MS;
  for (const t of list) {
    if (t === cur || inSplit(t) || !t.view || t.audio || t.lastUsed > cut) continue;
    destroy(t);
  }
}

function setLocked(on) {
  locked = !!on;
  show();
  if (cur) pushTab(cur);
  deps.ui.push("locked", { on: locked && list.some(t => t.private && !t.archived) });
}
const isLocked = () => locked;

function cycle(dir) {
  const o = open();
  if (o.length < 2 || !cur) return;
  const i = o.indexOf(cur);
  select(o[(i + dir + o.length) % o.length].id);
}

function wcOf(t = cur) { return t && alive(t) ? t.view.webContents : null; }

function load(url, t = cur) {
  if (!t) return;
  if (!alive(t)) {
    t.url = url; t.entries = []; t.index = undefined;
    if (!(locked && t.private)) { createView(t); show(); }
    return;
  }
  t.view.webContents.loadURL(pdfViewerUrl(url) || url).catch(() => {});
}

function go(text) {
  if (cur && !cur.private && prefs.p.historySuggest) history.addSearch(text);
  const url = prefs.resolve(String(text || ""), relay.available);
  load(url);
  wcOf()?.focus();
  return true;
}

function back() { const w = wcOf(); if (w?.navigationHistory.canGoBack()) w.navigationHistory.goBack(); }
function forward() { const w = wcOf(); if (w?.navigationHistory.canGoForward()) w.navigationHistory.goForward(); }
function stop() { wcOf()?.stop(); }
function home() { load(HOME); }
function reload(hard) {
  if (!cur) return;
  if (cur.crashed || !alive(cur)) { destroy(cur); createView(cur); show(); return; }
  if (cur.failUrl) { cur.view.webContents.loadURL(cur.failUrl).catch(() => {}); return; }
  if (hard) cur.view.webContents.reloadIgnoringCache(); else cur.view.webContents.reload();
}
function refresh() { if (cur) pushTab(cur); }

function init(d) {
  deps = d; win = d.win;
  const saved = store.load("tabs", { current: null, tabs: [], closed: [] });
  list = (Array.isArray(saved.tabs) ? saved.tabs : []).filter(t => t && t.url).map(make);
  closed = Array.isArray(saved.closed) ? saved.closed.filter(c => c && c.url).slice(0, MAX_CLOSED) : [];
  setInterval(discardIdle, 60 * 1000).unref?.();
  const start = list.find(t => t.id === saved.current && !t.archived) || open().sort((a, b) => b.lastUsed - a.lastUsed)[0];
  if (start) select(start.id); else create({});
}

module.exports = {
  HOME, init, byContents, all, current, open, info, listing, select, create, move, newTab: create, close, reopen,
  undoClose, closeAll, archive, restore, deleteArchived, clearArchived, autoArchive, thumb, setLocked,
  isLocked, cycle, splitWith, toggleSplit, endSplit, setSplitRatio, isSplit: () => !!split, go, load, back, forward, stop, home, reload, refresh, fit, show, wcOf, pushTab, persist,
};
