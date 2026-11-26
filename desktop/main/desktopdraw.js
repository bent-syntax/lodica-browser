"use strict";
// Draw over the whole desktop (Ctrl+Alt+D). A transparent window covers the screen under the pointer; Esc or the shortcut
// again closes it. Nothing is saved, unlike drawings on tabs (main/draw.js), which are stored per page.
const { app, BrowserWindow, globalShortcut, screen } = require("electron");
const path = require("path");

const KEY = "CommandOrControl+Alt+D";
let win = null;

function toggle() {
  if (win && !win.isDestroyed()) { win.close(); return; }
  const b = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, backgroundColor: "#00000000",
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setMenuBarVisibility(false);
  win.webContents.on("before-input-event", (e, i) => { if (i.type === "keyDown" && i.key === "Escape") { e.preventDefault(); win.close(); } });
  win.on("closed", () => { win = null; });
  win.loadFile(path.join(__dirname, "..", "ui", "desktopdraw.html")).catch((e) => console.error("desktop draw", e.message));
}

function init() {
  let ok = false;
  try { ok = globalShortcut.register(KEY, toggle); } catch { /* taken by another app */ }
  if (!ok) console.error("desktop draw shortcut unavailable");
  app.on("will-quit", () => globalShortcut.unregister(KEY));
}

module.exports = { init, toggle, KEY };
