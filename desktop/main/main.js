// Lodica main process: window, UI view, protocol, shortcuts and module wiring.
const path = require("path");
const keys = require("./keys");
const fs = require("fs");
const { pathToFileURL } = require("url");
const {
  app, BaseWindow, BrowserWindow, WebContentsView, protocol, net, session,
  clipboard, powerMonitor, Notification, dialog, nativeTheme,
} = require("electron");

const ROOT = path.join(__dirname, "..");
const SEARCH_DIR = path.join(ROOT, "search");
const PDF_DIR = path.join(ROOT, "pdf");
const ICON = path.join(ROOT, "build", "icon.png");
const PRIVATE = "lodica-private";

// Windows groups taskbar/notifications by this id; it matches the installer's appId so the Start-menu shortcut and toasts say "Lodica".
app.setName("Lodica");
// Pin the data folder so updates and repackaging (installer, AppImage, Flatpak) always find the same passwords and settings.
app.setPath("userData", path.join(app.getPath("appData"), "Lodica"));
if (process.platform === "win32") app.setAppUserModelId("be.syntaxya.lodica");

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.userAgentFallback = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${String(process.versions.chrome).split(".")[0]}.0.0.0 Safari/537.36`;

protocol.registerSchemesAsPrivileged([
  { scheme: "lodica", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null, uiView = null, topView = null, dividerView = null, panelView = null, lastClip = "";
let M = null; // feature modules, loaded after ready (safeStorage)
const pendingArgs = [];

/** Desktop notifications: a new browser version, and new chat messages while the chat is closed. */
function startNotifier(m) {
  let seenVersion = "", lastCheck = 0;
  const tick = async () => {
    if (!Notification.isSupported() || !m.relay.available) return;
    if (Date.now() - lastCheck > 30 * 60 * 1000) try {
      lastCheck = Date.now();
      const st = await m.updater.check();
      if (st.state === "available" && st.version !== seenVersion) {
        seenVersion = st.version;
        const n = new Notification({ title: `Lodica ${st.version} is available`, body: "Open Settings to download the update." });
        n.on("click", () => openSheet("settings"));
        n.show();
      }
    } catch {}
  };
  m.support.watch(() => openSheet("settings"));
  setTimeout(tick, 15000);
  setInterval(tick, 60 * 1000);
  // Unread chat messages, also the ones that arrived while the computer was off: a chip on the toolbar until they are read.
  m.room.events.on("unread", (u) => m.ui.push("unread", u));
  m.room.watch((g) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: g.messages.length === 1 ? `New message in ${g.where}` : `${g.messages.length} new messages in ${g.where}`,
      body: g.messages.slice(-3).map(x => `${x.name}: ${x.text}`).join("\n"),
    });
    n.on("click", () => { m.ui.push("openRoom", g.room); win.show(); });
    n.show();
  });
}

function serveLodica(req) {
  let u;
  try { u = new URL(req.url); } catch { return new Response("Bad request", { status: 400 }); }
  if (u.hostname === "error") return require("./errorpage").serve(req.url);
  if (u.hostname === "pdf") return servePdf(req, u);
  if (u.hostname === "settings") return new Response("<!doctype html><title>Settings</title><body style=\"background:#17181B\">", { headers: { "content-type": "text/html" } });
  if (u.hostname !== "search") return new Response("Not found", { status: 404 });
  let rel;
  try { rel = decodeURIComponent(u.pathname); } catch { return new Response("Bad request", { status: 400 }); }
  if (!rel || rel === "/") rel = "/search.html";
  if (rel.startsWith("/_bg/")) {
    const name = rel.slice(5);
    if (!/^[\w.-]+\.(png|jpe?g|webp|gif|avif)$/i.test(name)) return new Response("Forbidden", { status: 403 });
    const custom = path.join(app.getPath("userData"), "bg", name);
    if (!fs.existsSync(custom)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(custom).toString());
  }
  const file = path.resolve(SEARCH_DIR, "." + rel);
  if (file !== SEARCH_DIR && !file.startsWith(SEARCH_DIR + path.sep)) return new Response("Forbidden", { status: 403 });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("Not found", { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

// Saves the editor's blocks as a real .docx at a path the user picks (never a PDF).
async function saveDocx(req) {
  try {
    const { name, blocks } = await req.json();
    if (!Array.isArray(blocks)) return new Response("Bad request", { status: 400 });
    const r = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath("documents"), (String(name || "Document").replace(/[\\/:*?"<>|]/g, "_") || "Document") + ".docx"),
      filters: [{ name: "Word document", extensions: ["docx"] }],
    });
    if (r.canceled || !r.filePath) return new Response(null, { status: 204 });
    const file = /\.docx$/i.test(r.filePath) ? r.filePath : r.filePath + ".docx";
    fs.writeFileSync(file, await require("./docx").fromBlocks(blocks));
    return new Response(path.basename(file));
  } catch (e) { return new Response(String(e.message), { status: 500 }); }
}

// Saves the edited original .docx bytes at a path the user picks.
async function saveDocxRaw(req, u, kind = "docx") {
  try {
    const bytes = Buffer.from(await req.arrayBuffer());
    const magic = kind === "pdf" ? "%P" : "PK";
    if (!bytes.length || bytes.length > 200 * 1024 * 1024 || bytes.toString("latin1", 0, 2) !== magic) return new Response("Bad request", { status: 400 });
    const r = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath("documents"), (String(u.searchParams.get("name") || "Document").replace(/[\\/:*?"<>|]/g, "_") || "Document") + "." + kind),
      filters: [kind === "pdf" ? { name: "PDF", extensions: ["pdf"] } : { name: "Word document", extensions: ["docx"] }],
    });
    if (r.canceled || !r.filePath) return new Response(null, { status: 204 });
    const file = r.filePath.toLowerCase().endsWith("." + kind) ? r.filePath : r.filePath + "." + kind;
    fs.writeFileSync(file, bytes);
    return new Response(path.basename(file));
  } catch (e) { return new Response(String(e.message), { status: 500 }); }
}

// Bundled pdf.js viewer. Remote and local PDFs go through /f?u=<url> so the viewer reads them same-origin.
function servePdf(req, u) {
  if (u.pathname === "/docx-html") {
    const target = u.searchParams.get("u") || "";
    if (!/^(https?|file):/i.test(target)) return new Response("Forbidden", { status: 403 });
    return require("./docx").toHtml(target)
      .then(html => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }))
      .catch(e => new Response(String(e.message), { status: 500 }));
  }
  if (u.pathname === "/docx-save" && req.method === "POST") return saveDocx(req);
  if (u.pathname === "/rev-image") {
    const png = require("./reverseimage").take(u.searchParams.get("id") || "");
    return png ? new Response(png, { headers: { "Content-Type": "image/png" } }) : new Response("Gone", { status: 404 });
  }
  if (u.pathname === "/docx-save-raw" && req.method === "POST") return saveDocxRaw(req, u);
  if (u.pathname === "/pdf-save-raw" && req.method === "POST") return saveDocxRaw(req, u, "pdf");
  if (u.pathname === "/docx-raw") {
    const target = u.searchParams.get("u") || "";
    if (!/^(https?|file):/i.test(target)) return new Response("Forbidden", { status: 403 });
    return net.fetch(target).then(async (r) => {
      if (!r.ok) return new Response("HTTP " + r.status, { status: 502 });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 50 * 1024 * 1024) return new Response("File too large", { status: 413 });
      return new Response(buf, { headers: { "Content-Type": "application/octet-stream" } });
    }).catch((e) => new Response(String(e.message), { status: 500 }));
  }
  if (u.pathname === "/docx") {
    const target = u.searchParams.get("u") || "";
    if (!/^(https?|file):/i.test(target)) return new Response("Forbidden", { status: 403 });
    return require("./docx").toPdf(target)
      .then(pdf => new Response(pdf, { headers: { "Content-Type": "application/pdf" } }))
      .catch(e => new Response("Could not open this document: " + e.message, { status: 500 }));
  }
  if (u.pathname === "/f") {
    const target = u.searchParams.get("u") || "";
    if (!/^(https?|file):/i.test(target)) return new Response("Forbidden", { status: 403 });
    const headers = {};
    const range = req.headers.get("range");
    if (range) headers.Range = range;
    return fetchPdf(target, headers, range);
  }
  let rel;
  try { rel = decodeURIComponent(u.pathname); } catch { return new Response("Bad request", { status: 400 }); }
  const file = path.resolve(PDF_DIR, "." + rel);
  if (!file.startsWith(PDF_DIR + path.sep)) return new Response("Forbidden", { status: 403 });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("Not found", { status: 404 });
  return net.fetch(pathToFileURL(file).toString()).then(r => {
    // Module workers need a JavaScript type; file:// answers can lack one for .mjs.
    const type = { ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".wasm": "application/wasm" }[path.extname(file)];
    if (!type) return r;
    const h = new Headers(r.headers); h.set("Content-Type", type);
    return new Response(r.body, { status: r.status, headers: h });
  });
}

// A PDF that loaded once stays readable while its tab is open: after a session expiry the same address answers with a
// login page, so a later fetch that is not a PDF is served from the copy kept here (shortcut: 20 files in memory).
const pdfKeep = new Map();
async function fetchPdf(target, headers, range) {
  const kept = pdfKeep.get(target);
  const res = await net.fetch(target, { headers }).catch(() => null);
  const type = res ? res.headers.get("content-type") || "" : "";
  if (res && res.ok && /pdf/i.test(type)) {
    // Rebuild the response: net.fetch leaves content-encoding/length headers that no longer match the decoded body.
    const buf = Buffer.from(await res.arrayBuffer());
    const h = { "Content-Type": "application/pdf", "Accept-Ranges": "bytes" };
    const cr = res.headers.get("content-range");
    if (cr) h["Content-Range"] = cr;
    if (res.status === 200 && !range) {
      pdfKeep.delete(target); pdfKeep.set(target, buf);
      if (pdfKeep.size > 20) pdfKeep.delete(pdfKeep.keys().next().value);
    }
    return new Response(buf, { status: res.status, headers: h });
  }
  if (!kept) return res || new Response("Not found", { status: 502 });
  const h = { "Content-Type": "application/pdf", "Accept-Ranges": "bytes" };
  const m = /bytes=(\d*)-(\d*)/.exec(range || "");
  if (!m) return new Response(kept, { headers: h });
  const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], kept.length - 1) : kept.length - 1;
  return new Response(kept.subarray(a, b + 1), { status: 206, headers: { ...h, "Content-Range": `bytes ${a}-${b}/${kept.length}` } });
}

function registerProtocol(ses) {
  try { ses.protocol.handle("lodica", serveLodica); } catch (e) { console.error("lodica protocol", e.message); }
}

const sessions = () => [session.defaultSession, session.fromPartition(PRIVATE)];

function openApp(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) return null;
  const w = new BrowserWindow({
    width: 1000, height: 760, minWidth: 400, minHeight: 500, backgroundColor: "#ffffff",
    autoHideMenuBar: true, ...(fs.existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: { sandbox: true, contextIsolation: true, session: session.defaultSession },
  });
  w.setMenuBarVisibility(false);
  w.webContents.setUserAgent(M.prefs.userAgentValue());
  w.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:\/\//i.test(u)) M.tabs.create({ url: u });
    return { action: "deny" };
  });
  w.loadURL(url).catch(() => {});
  return w;
}

function handleArgs(argv) {
  if (!M) { pendingArgs.push(argv); return; }
  let opened = false;
  for (const a of argv.slice(1)) {
    if (a === "--new-tab") { M.tabs.create({}); opened = true; }
    else if (a === "--private") { M.tabs.create({ private: true }); opened = true; }
    else if (a.startsWith("--app=")) { openApp(a.slice(6)); opened = true; }
    else if (a.startsWith("--sheet=")) { if (openSheet(a.slice(8))) opened = true; }
    else if (/^https?:\/\//i.test(a)) { M.tabs.create({ url: a }); opened = true; }
    else if (/\.(pdf|docx|svg)$/i.test(a) && fs.existsSync(a)) { M.tabs.create({ url: pathToFileURL(path.resolve(a)).toString() }); opened = true; }
    else if (/\.html?$/i.test(a) && fs.existsSync(a)) { M.tabs.create({ url: pathToFileURL(path.resolve(a)).toString() }); opened = true; }
  }
  return opened;
}

const SHEETS = new Set(["reader", "inbox", "history", "downloads", "passwords", "meter", "remind", "speed",
  "quality", "closed", "memory", "menu", "settings", "switcher", "ai", "aichat", "preview"]);

function openSheet(name, data) {
  if (!M || !SHEETS.has(name)) return false;
  focusWindow();
  M.ui.push("sheet", { name, data });
  return true;
}

function focusWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

app.on("second-instance", (_e, argv) => {
  focusWindow();
  handleArgs(argv);
});

// A lone Alt tap opens the menu, like Windows apps. Windows only: on Linux the compositor (Hyprland, Oxide, KDE) takes
// Alt+key and Alt+drag itself, so the browser sees only the Alt and the menu kept popping up. Held Alt never counts.
let altAlone = false, altAt = 0;

function shortcut(e, input) {
  if (!M) return;
  const { ui } = M;
  const k = input.key;
  if (input.type === "keyUp") {
    if (k === "Alt" && altAlone && process.platform === "win32" && Date.now() - altAt < 400) ui.push("shortcut", "menu");
    if (k === "Alt") altAlone = false;
    return;
  }
  if (input.type !== "keyDown") return;
  if (k !== "Alt") altAlone = false;
  else if (!input.isAutoRepeat) { altAlone = true; altAt = Date.now(); }
  if (k === "Escape" && !input.control && !input.meta && !input.alt && !input.shift) { ui.push("shortcut", "escape"); return; }
  const id = M.commands.keyActionFor(keys.fromInput(input));
  if (!id) return;
  e.preventDefault();
  M.commands.runKey(id);
}

// Debug overlay (Ctrl+Alt+Shift+D): counts every input event type that reaches the page so a touchpad can be diagnosed.
const dbg = { counts: {}, last: "", at: 0, maxX: {}, maxY: {} };
function swipeDebug(wc, label) {
  const k = label.split(" ")[0];
  dbg.counts[k] = (dbg.counts[k] || 0) + 1;
  if (k !== "mouseMove") {
    const m = /dx=(-?\d+) dy=(-?\d+)/.exec(label);
    if (m) { dbg.maxX[k] = Math.max(dbg.maxX[k] || 0, Math.abs(+m[1])); dbg.maxY[k] = Math.max(dbg.maxY[k] || 0, Math.abs(+m[2])); if (+m[1] || +m[2]) dbg.last = label; }
    else dbg.last = label;
  }
  const now = Date.now();
  if (now - dbg.at < 200 || wc.isDestroyed()) return;
  dbg.at = now;
  const txt = Object.entries(dbg.counts).map(([a, b]) => a + ":" + b).join("  ") + "\nmax |dx|: " + JSON.stringify(dbg.maxX) + "\nmax |dy|: " + JSON.stringify(dbg.maxY) + "\nlast moving: " + dbg.last;
  wc.executeJavaScript("(()=>{let d=document.getElementById('lodica-swipe-dbg');if(!d){d=document.createElement('pre');d.id='lodica-swipe-dbg';d.style.cssText='position:fixed;top:8px;right:8px;z-index:2147483647;background:#17181B;color:#F59E0B;padding:8px 12px;border-radius:12px;font:12px monospace;pointer-events:none;white-space:pre-wrap;max-width:60vw';document.documentElement.append(d);}if(!window.__dbgw){window.__dbgw={n:0,x:0,y:0,m:0};addEventListener('wheel',e=>{const w=window.__dbgw;w.n++;w.x=Math.max(w.x,Math.abs(e.deltaX));w.y=Math.max(w.y,Math.abs(e.deltaY));w.m=e.deltaMode;},{capture:true,passive:true});}const w=window.__dbgw;d.textContent=" + JSON.stringify(txt) + "+'\\npage wheel n='+w.n+' maxX='+w.x+' maxY='+w.y+' mode='+w.m;})()").catch(() => {});
}
global.lodicaWheelDbg = (dx, sum, dy, shift) => {
  dbg.counts["domWheel"] = (dbg.counts["domWheel"] || 0) + 1;
  dbg.maxX["domWheel"] = Math.max(dbg.maxX["domWheel"] || 0, Math.abs(dx));
  dbg.maxY["domWheel"] = Math.max(dbg.maxY["domWheel"] || 0, Math.abs(dy || 0));
  dbg.maxX["sum"] = Math.max(dbg.maxX["sum"] || 0, Math.abs(sum));
  if (shift) dbg.counts["domShift"] = (dbg.counts["domShift"] || 0) + 1;
};
// Swipe reports from the page preload. Own channel: no tab lookup, so nothing between the page and history can drop it.
require("electron").ipcMain.handle("lodica-theme", () => global.lodicaTheme || null);
// Checkout coupon finder (preload/coupons.js): codes for this shop from the Lodica server. Off with Settings > Shopping.
require("electron").ipcMain.handle("coupons", async (_e, site) => {
  const on = !!M && M.relay.available && M.prefs.p.coupons !== false;
  if (!site) return { on };
  if (!on || !/^[a-z0-9.-]{3,253}$/i.test(String(site))) return { codes: [] };
  try {
    const [status, body] = await M.relay.request("GET", "/api/coupons?site=" + encodeURIComponent(String(site).toLowerCase()), 40000);
    return status === 200 ? JSON.parse(body) : { codes: [] };
  } catch { return { codes: [] }; }
});
// After a swipe navigation the new page has not seen the mouse yet, and wheel events were dropped until the cursor moved.
// A mouse move at the real cursor position tells the page it is hovered, so the next swipe works at once.
function hoverNewPage() {
  const { screen } = require("electron");
  const wc = M.tabs.wcOf();
  if (!wc || wc.isDestroyed()) return;
  const poke = () => {
    try {
      const v = M.tabs.current()?.view, c = win.getContentBounds(), b = v ? v.getBounds() : { x: 0, y: 0 }, p = screen.getCursorScreenPoint();
      if (wc.isDestroyed()) return;
      wc.sendInputEvent({ type: "mouseMove", x: Math.max(0, p.x - c.x - b.x), y: Math.max(0, p.y - c.y - b.y) });
    } catch { /* window closing */ }
  };
  wc.once("dom-ready", poke);
  wc.once("did-finish-load", poke);
}
require("electron").ipcMain.on("swipe", (_e, m) => {
  if (!m || typeof m !== "object") return;
  if (m.dir === "back" || m.dir === "forward") {
    const now = Date.now();
    if (now < (global.lodicaSwipeLock || 0)) return;
    global.lodicaSwipeLock = now + 700;
    M.commands.mouse(m.dir);
    hoverNewPage();
    return;
  }
  if (global.lodicaSwipeDebug) global.lodicaWheelDbg(+m.dx || 0, +m.sum || 0, +m.dy || 0, !!m.shift);
});
function swipeDebugEvents(win) {
  for (const n of ["app-command", "swipe", "scroll-touch-begin", "scroll-touch-end", "scroll-touch-edge"]) {
    win.on(n, (_e, a) => { dbg.counts[n] = (dbg.counts[n] || 0) + 1; dbg.last = n + " " + (typeof a === "string" ? a : ""); });
  }
}

// Two-finger touchpad swipe: the page preload (preload/swipe.js) owns the pull and the decision, so a swipe never goes back
// twice or without the blob. Main only tells it when Chromium sees the fingers lift (scroll end or fling start).
function swipeNav(wc) {
  wc.on("input-event", (_e, ev) => {
    if (global.lodicaSwipeDebug) swipeDebug(wc, ev.type + " dx=" + Math.round(ev.deltaX || 0) + " dy=" + Math.round(ev.deltaY || 0));
    if (ev.type === "gestureScrollEnd" || ev.type === "gestureFlingStart") {
      try { wc.mainFrame.send("lodica-swipe-end"); } catch { /* frame gone */ }
    }
  });
}

function onView(t, wc) {
  wc.on("before-input-event", (e, i) => {
    if (i.type === "keyDown" && i.control && i.alt && i.shift && i.key.toLowerCase() === "d") {
      global.lodicaSwipeDebug = !global.lodicaSwipeDebug; dbg.counts = {}; e.preventDefault(); return;
    }
    shortcut(e, i);
  });
  swipeNav(wc);
  // A navigation just started (maybe by Chromium's own swipe): the swipe handlers must not go back a second time.
  wc.on("did-start-navigation", (e) => { if (e.isMainFrame) global.lodicaSwipeLock = Date.now() + 1200; });
  wc.on("enter-html-full-screen", () => M.ui.setFull(true));
  wc.on("leave-html-full-screen", () => M.ui.setFull(false));
  wc.once("destroyed", () => M.ui.setFull(false));
  M.commands.applyAgent(t, wc);
  M.helper.syncScheme(wc);
  // A cross-process navigation can drop the emulated scheme, so sites showed dark with "Dark pages" off.
  wc.on("did-start-navigation", (e) => { if (e.isMainFrame && !e.isSameDocument && !wc.isDestroyed()) M.helper.syncScheme(wc); });
  // Sites flagged desktopInput need the desktop UA from the first request, even in a mobile-site tab.
  wc.on("did-start-navigation", (e) => {
    if (!e.isMainFrame || e.isSameDocument || wc.isDestroyed()) return;
    let host = "";
    try { host = new URL(e.url).hostname; } catch { /* keep empty */ }
    const ua = M.prefs.agentFor(t, host);
    if (wc.getUserAgent() !== ua) wc.setUserAgent(ua);
  });
}

async function checkClipboard() {
  if (!M) return;
  let text = "";
  try { text = (await clipboard.readText()).trim(); } catch { return; } // Electron 44: readText returns a promise
  if (!text || text === lastClip || text.length > 2000 || /\s/.test(text)) return;
  lastClip = text;
  if (!/^https?:\/\/[^\s]+$/i.test(text)) return;
  try { new URL(text); } catch { return; }
  if (text === M.tabs.current()?.url) return;
  M.ui.push("clipboard", { url: text });
}

// The whole browser window, page included, fades so the apps under it show. Windows and macOS only.
function applyOpacity() {
  const a = Math.min(100, Math.max(30, Number(M && M.prefs.p.uiAlpha) || 100)) / 100;
  try { if (win && !win.isDestroyed()) win.setOpacity(a); } catch { /* not supported on this system */ }
}

function createWindow() {
  // A see-through window must be created that way, so changing transparency or blur applies after a restart.
  const pp = (M && M.prefs.p) || {};
  const seeThrough = !!pp.uiBlur;
  // Windows only: hide the title bar and let the OS draw the caption buttons over our own top strip.
  // Linux and macOS keep the native frame; a see-through window keeps it too.
  global.lodicaFrameless = process.platform === "win32" && !seeThrough;
  win = new BaseWindow({
    width: 1200, height: 800, minWidth: 400, minHeight: 500, backgroundColor: seeThrough ? "#00000000" : "#17181B",
    ...(seeThrough ? { transparent: true } : {}),
    ...(seeThrough && pp.uiBlur && process.platform === "win32" ? { backgroundMaterial: "acrylic" } : {}),
    ...(seeThrough && pp.uiBlur && process.platform === "darwin" ? { vibrancy: "under-window" } : {}),
    ...(global.lodicaFrameless ? { titleBarStyle: "hidden", titleBarOverlay: { color: "#17181B", symbolColor: "#ECEDEE", height: 44 } } : {}),
    title: "Lodica", autoHideMenuBar: true, ...(fs.existsSync(ICON) ? { icon: ICON } : {}),
  });
  win.setMenuBarVisibility?.(false);
  // Last theme icon from the previous run, so the taskbar is right before the UI reports colors.
  if (!global.__lodicaIcon) {
    try {
      const img = require("electron").nativeImage.createFromPath(path.join(app.getPath("userData"), "theme-icon.png"));
      if (!img.isEmpty()) { global.__lodicaIcon = img; win.setIcon(img); }
    } catch {}
  }
  const reIcon = () => { try { if (global.__lodicaIcon && !win.isDestroyed()) win.setIcon(global.__lodicaIcon); } catch {} };
  win.on("show", reIcon); win.on("focus", reIcon); win.on("restore", reIcon);
  uiView = new WebContentsView({
    webPreferences: { preload: path.join(ROOT, "preload", "ui.js"), contextIsolation: true, sandbox: true },
  });
  uiView.setBackgroundColor("#00000000");
  uiView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  uiView.webContents.on("will-navigate", e => e.preventDefault());
  topView = new WebContentsView({
    webPreferences: { preload: path.join(ROOT, "preload", "ui.js"), contextIsolation: true, sandbox: true },
  });
  topView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  topView.webContents.on("will-navigate", e => e.preventDefault());
  dividerView = new WebContentsView({
    webPreferences: { preload: path.join(ROOT, "preload", "ui.js"), contextIsolation: true, sandbox: true },
  });
  dividerView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  dividerView.webContents.on("will-navigate", e => e.preventDefault());
  panelView = new WebContentsView({
    webPreferences: { preload: path.join(ROOT, "preload", "ui.js"), contextIsolation: true, sandbox: true },
  });
  panelView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  panelView.webContents.on("will-navigate", e => e.preventDefault());
  win.contentView.addChildView(topView);
  win.contentView.addChildView(panelView);
  win.contentView.addChildView(uiView);
}

function loadModules() {
  const r = n => require("./" + n);
  return {
    store: r("store"), prefs: r("prefs"), relay: r("relay"), history: r("history"), vault: r("vault"),
    meter: r("meter"), helper: r("helper"), ai: r("ai"), search: r("search"), net: r("net"),
    room: r("room"), pctabs: r("pctabs"), downloads: r("downloads"), remind: r("remind"), webapps: r("webapps"),
    perms: r("perms"), extensions: r("extensions"), serial: r("serial"), updater: r("updater"), support: r("support"), testsession: r("testsession"), commands: r("commands"), tabs: r("tabs"), ui: r("ui"),
  };
}

function wire(m) {
  const { ui, tabs } = m;
  const ses = sessions();
  const helperUi = {
    ...ui,
    push: (ev, data) => {
      if (ev === "tab" && data && data.id !== tabs.current()?.id) return;
      ui.push(ev, data);
    },
  };
  m.helper.init({ tabs, ui: helperUi, vault: m.vault, meter: m.meter, ai: m.ai });
  require("./draw").init({ tabs });
  require("./qrhover").init({ tabs, ui, win: () => win });
  m.ai.init({ onChange: s => ui.push("ai", s) });
  if (m.ai.status().connected && !m.prefs.p.ai && !m.prefs.p.aiAutoOn) { m.prefs.set("ai", true); m.prefs.set("aiAutoOn", true); }
  m.net.init({ tabs, meter: m.meter, ui, sessions: ses });
  m.pctabs.init({ tabs, ui, ai: m.ai });
  m.downloads.init({ ui, sessions: ses, anim: (src, total) => require("./dlpage").play({ src, active: () => tabs.wcOf(), total }) });
  m.remind.init({ tabs, win: () => win });
  m.webapps.init({ tabs, openApp });
  m.perms.init({ ui, tabs, sessions: ses });
  m.serial.init({ ui, sessions: ses });
  m.updater.init({ ui });
  m.testsession.init({ ui, tabs });
  m.extensions.init();
  m.commands.init({ ...m, win: () => win });
  m.search.init({ ai: m.ai, sessions: ses, suggest: m.commands.suggest, topSites: m.commands.topSitesFor });

  m.relay.events.on("change", () => ui.push("relay", m.relay.state));
  m.room.events.on("change", () => ui.push("room", m.room.state));
  m.relay.events.on("mail", (alias, mail) => {
    ui.push("mail", { site: alias?.site, link: m.relay.confirmLink(mail), alias: alias?.address });
    if (Notification.isSupported()) {
      const n = new Notification({ title: "Confirmation mail", body: alias?.site ? `From ${alias.site}` : "New confirmation mail" });
      n.on("click", () => openSheet("inbox"));
      n.show();
    }
  });
  startNotifier(m);
  // Every prefs push carries the desktop colours, so the toolbar and panels keep the System theme after any setting changes.
  const sysTheme = require("./sysaccent");
  const pushPrefs = () => ui.push("prefs", Object.assign({}, m.prefs.p, { sysAccent: sysTheme.current() }));
  sysTheme.watch(pushPrefs);
  m.prefs.events.on("change", key => {
    pushPrefs();
    tabs.refresh();
    if (key === "vertTabs" || key === "barBottom" || key === "vertWidth" || key === "vertCollapsed") { ui.fit(); tabs.fit(); }
    if (["theme", "customTheme", "themePlugin", "holidayFx", "bg"].includes(key)) for (const t of tabs.all()) {
      const wc = tabs.wcOf(t);
      if (wc && !wc.isDestroyed() && /^lodica:\/\/search\/search\.html(\?(?!.*\bq=)[^#]*)?$/.test(wc.getURL())) wc.reload();
    }
    if (key === "userAgent") for (const t of tabs.all()) { const wc = tabs.wcOf(t); if (wc) m.commands.applyAgent(t, wc); }
  });

  tabs.init({
    win, ui, helper: m.helper,
    divider: dividerView,
    raise: () => { if (win && !win.isDestroyed()) win.contentView.addChildView(uiView); },
    onView,
    onChange: () => m.pctabs.schedule(),
  });
}

// Native Wayland when available, X11 otherwise. No effect on Windows.
if (process.platform === "linux") app.commandLine.appendSwitch("ozone-platform-hint", "auto");
// Windows: Chromium's own two-finger touchpad swipe for history back/forward (like Firefox).
if (process.platform === "win32") app.commandLine.appendSwitch("enable-features", "TouchpadOverscrollHistoryNavigation,OverscrollHistoryNavigation");
// Windows: Chromium's occlusion check can wrongly treat the window as covered and throttle timers and frames, which
// halves benchmark scores. The window is always drawn by us, so skip the check.
if (process.platform === "win32") { app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion"); app.commandLine.appendSwitch("disable-backgrounding-occluded-windows"); }

app.whenReady().then(() => {
  require("./systheme").follow(nativeTheme); // Linux: follow Hyprland/KDE/GNOME/GTK dark-light preference
  for (const ses of sessions()) registerProtocol(ses);
  for (const ses of sessions()) {
    for (const name of ["swipe", "translate", "youtube", "coupons"]) {
      try { ses.registerPreloadScript({ type: "frame", id: "lodica-" + name, filePath: path.join(ROOT, "preload", name + ".js") }); } catch (e) { console.error(name + " preload", e.message); }
    }
  }
  createWindow();
  const m = loadModules();
  m.ui.init(win, uiView);
  m.ui.initTop(topView);
  m.ui.initDivider(dividerView);
  m.ui.initPanel(panelView);
  M = m;
  wire(m);
  applyOpacity();
  m.prefs.events.on("change", (k) => { if (k === "uiAlpha") applyOpacity(); });
  require("./emojipicker").init(m.prefs);
  require("./circlesearch").init({ tabs: require("./tabs"), prefs: m.prefs, getWindow: () => win });
  require("./desktopdraw").init();
  Promise.resolve().then(() => clipboard.readText()).then((t) => { lastClip = String(t || "").trim(); }).catch(() => { /* no clipboard */ });
  uiView.webContents.loadFile(path.join(ROOT, "ui", "index.html")).catch(e => console.error("ui load", e.message));
  panelView.webContents.loadFile(path.join(ROOT, "ui", "aipanel.html")).catch(e => console.error("panel load", e.message));
  dividerView.webContents.loadFile(path.join(ROOT, "ui", "divider.html")).catch(e => console.error("divider load", e.message));
  topView.webContents.loadFile(path.join(ROOT, "ui", "top.html")).catch(e => console.error("top load", e.message));
  // A dying UI renderer must not leave a dead window: log it and reload the view.
  const errorpage = require("./errorpage");
  for (const v of [uiView, topView]) {
    v.webContents.on("render-process-gone", (_, d) => {
      errorpage.crashLog({ kind: "ui-render-process-gone", reason: d?.reason, exitCode: d?.exitCode });
      if (d?.reason !== "clean-exit" && !v.webContents.isDestroyed()) setImmediate(() => { try { v.webContents.reload(); } catch { /* closing */ } });
    });
  }
  process.on("uncaughtException", e => errorpage.crashLog({ kind: "uncaughtException", reason: String(e && e.message).slice(0, 200) }));
  process.on("unhandledRejection", e => errorpage.crashLog({ kind: "unhandledRejection", reason: String(e && e.message || e).slice(0, 200) }));
  m.ui.setRefocus(() => { try { m.tabs.wcOf()?.focus(); } catch { /* closing */ } });
  m.ui.fit();
  m.tabs.fit();

  win.on("resize", () => { m.ui.fit(); m.tabs.fit(); });
  win.on("maximize", () => { m.ui.fit(); m.tabs.fit(); });
  win.on("unmaximize", () => { m.ui.fit(); m.tabs.fit(); });
  win.on("app-command", (_e, cmd) => {
    if (cmd === "browser-backward") m.commands.mouse("back");
    else if (cmd === "browser-forward") m.commands.mouse("forward");
  });
  swipeDebugEvents(win);
  if (process.platform === "win32") {
    // Raw WM_APPCOMMAND: Electron names only some commands, touchpad drivers may send others.
    win.hookWindowMessage(0x0319, (_w, lp) => {
      let c = 0;
      try { c = (Buffer.from(lp).readUInt32LE(0) >>> 16) & 0x0fff; } catch {}
      dbg.counts["wm-appcommand"] = (dbg.counts["wm-appcommand"] || 0) + 1;
      dbg.last = "wm-appcommand " + c;
      if (Date.now() - (global.lodicaWmNav || 0) < 600) return;
      if (c === 1) { global.lodicaWmNav = Date.now(); m.commands.mouse("back"); }
      else if (c === 2) { global.lodicaWmNav = Date.now(); m.commands.mouse("forward"); }
    });
  }
  win.on("swipe", (_e, dir) => { if (dir === "left") m.commands.mouse("back"); else if (dir === "right") m.commands.mouse("forward"); });
  win.on("focus", checkClipboard);
  win.on("minimize", () => m.tabs.setLocked(true));
  win.on("closed", () => { win = null; app.quit(); });
  powerMonitor.on("lock-screen", () => m.tabs.setLocked(true));

  if (process.platform === "win32") {
    app.setUserTasks([
      { program: process.execPath, arguments: argsFor("--new-tab"), iconPath: process.execPath, iconIndex: 0, title: "New tab", description: "Open a new tab" },
      { program: process.execPath, arguments: argsFor("--private"), iconPath: process.execPath, iconIndex: 0, title: "New private tab", description: "Open a new private tab" },
      { program: process.execPath, arguments: argsFor("--sheet=history"), iconPath: process.execPath, iconIndex: 0, title: "History", description: "Show history" },
      { program: process.execPath, arguments: argsFor("--sheet=downloads"), iconPath: process.execPath, iconIndex: 0, title: "Downloads", description: "Show downloads" },
      { program: process.execPath, arguments: argsFor("--sheet=inbox"), iconPath: process.execPath, iconIndex: 0, title: "Relay inbox", description: "Show confirmation mails" },
    ]);
  }

  const archive = () => { try { m.tabs.autoArchive(m.prefs.p.autoArchiveDays); } catch (e) { console.error("auto-archive", e.message); } };
  archive();
  setInterval(archive, 60 * 60 * 1000).unref?.();

  handleArgs(process.argv);
  while (pendingArgs.length) handleArgs(pendingArgs.shift());
});

function argsFor(flag) {
  return app.isPackaged ? flag : `"${path.resolve(ROOT)}" ${flag}`;
}

app.on("before-quit", () => {
  try { M?.commands.closePreview(); } catch { /* window gone */ }
  try { M?.store.flush(); } catch (e) { console.error("flush", e.message); }
});

app.on("window-all-closed", () => app.quit());
