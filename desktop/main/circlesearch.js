"use strict";
// Circle to search (Ctrl+Alt+C). The screen under the pointer is captured once and shown frozen in a full-screen window. The user
// draws over it: a line over text copies that text (read locally with OCR), a circle around a picture searches the web for that
// picture (reverse image search). The capture only lives in memory while the window is open.
const { app, BrowserWindow, globalShortcut, desktopCapturer, screen, ipcMain, clipboard, Notification } = require("electron");
const path = require("path");

const KEY = "CommandOrControl+Alt+C";
let win = null, shot = null, disp = null, busy = false;
let deps = { tabs: null, prefs: null, getWindow: () => null };

function close() {
  busy = false; shot = null;
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}

async function open() {
  if (win) { close(); return; }
  const pt = screen.getCursorScreenPoint();
  disp = screen.getDisplayNearestPoint(pt);
  let thumb;
  try {
    const px = { width: Math.round(disp.size.width * disp.scaleFactor), height: Math.round(disp.size.height * disp.scaleFactor) };
    const srcs = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: px });
    const s = srcs.find((x) => String(x.display_id) === String(disp.id)) || srcs[0];
    thumb = s && s.thumbnail;
  } catch { /* no screen capture permission */ }
  if (!thumb || thumb.isEmpty()) { try { new Notification({ title: "Circle to search", body: "Lodica could not capture the screen." }).show(); } catch { /* none */ } return; }
  shot = thumb;
  const b = disp.bounds;
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, frame: false, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: false, fullscreenable: false, backgroundColor: "#000000",
    webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, "..", "preload", "circlesearch.js") },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setMenuBarVisibility(false);
  win.webContents.on("before-input-event", (e, i) => { if (i.type === "keyDown" && i.key === "Escape") { e.preventDefault(); close(); } });
  win.on("closed", () => { win = null; shot = null; });
  win.webContents.once("did-finish-load", () => {
    if (win && !win.isDestroyed() && shot) win.webContents.send("cs:shot", { url: shot.toDataURL(), w: b.width, h: b.height });
  });
  win.loadFile(path.join(__dirname, "..", "ui", "circlesearch.html")).catch((e) => console.error("circle search", e.message));
}

/** The part of the capture the user drew around, as a native image. */
function cropOf(r) {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const sz = shot.getSize();
  const k = sz.width / disp.size.width;
  const x = Math.max(0, Math.round(n(r.x) * k)), y = Math.max(0, Math.round(n(r.y) * k));
  const w = Math.min(sz.width - x, Math.round(n(r.w) * k)), h = Math.min(sz.height - y, Math.round(n(r.h) * k));
  if (w < 8 || h < 8) return null;
  return shot.crop({ x, y, width: w, height: h });
}

async function run(kind, r) {
  let img = cropOf(r || {});
  if (!img) return { ok: false, error: "Draw a bigger shape" };
  if (kind === "text") {
    // Small text reads much better when it is enlarged first.
    const s = img.getSize();
    if (s.height < 120) img = img.resize({ width: s.width * 3, height: s.height * 3, quality: "best" });
    const text = await require("./ocr").recognize(img.toPNG());
    if (!text) return { ok: false, error: "No text found" };
    clipboard.writeText(text);
    return { ok: true, text };
  }
  const url = await require("./reverseimage").urlFor(img.toPNG(), deps.prefs.p.reverseEngine);
  deps.tabs.create({ url });
  close();
  const main = deps.getWindow();
  if (main && !main.isDestroyed()) { if (main.isMinimized()) main.restore(); main.show(); main.focus(); }
  return { ok: true };
}

function init(d) {
  deps = Object.assign(deps, d);
  ipcMain.handle("cs:run", async (e, kind, r) => {
    if (!win || e.sender !== win.webContents || busy || (kind !== "text" && kind !== "image")) return { ok: false };
    busy = true;
    try { return await run(kind, r); }
    catch (err) { return { ok: false, error: String((err && err.message) || err).slice(0, 80) }; }
    finally { busy = false; }
  });
  ipcMain.on("cs:close", (e) => { if (win && e.sender === win.webContents) close(); });
  let ok = false;
  try { ok = globalShortcut.register(KEY, () => { open().catch((e) => console.error("circle search", e.message)); }); } catch { /* taken by another app */ }
  if (!ok) console.error("circle to search shortcut unavailable");
  app.on("will-quit", () => globalShortcut.unregister(KEY));
}

module.exports = { init, open, KEY };
