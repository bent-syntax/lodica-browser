// Small always-available emoji picker: a global shortcut opens the server emojis, a click copies one as an image.
const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, nativeImage, screen } = require("electron");
const path = require("path");

const KEY = "CommandOrControl+Alt+E";
let win = null, source = async () => [], registered = false;

function setSource(fn) { source = fn; }

function hide() { if (win && !win.isDestroyed()) win.hide(); }

function show() {
  if (win && !win.isDestroyed()) {
    if (win.isVisible()) return hide();
  } else {
    win = new BrowserWindow({
      width: 340, height: 300, show: false, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
      backgroundColor: "#111827",
      webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, "..", "preload", "emojipicker.js") },
    });
    win.setMenuBarVisibility(false);
    win.on("blur", hide);
    win.on("closed", () => { win = null; });
    win.loadFile(path.join(__dirname, "..", "ui", "emojipicker.html")).catch(e => console.error("emoji picker", e.message));
  }
  const pt = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(pt).workArea;
  const x = Math.min(Math.max(pt.x - 170, wa.x), wa.x + wa.width - 340);
  const y = Math.min(Math.max(pt.y - 150, wa.y), wa.y + wa.height - 300);
  win.setPosition(Math.round(x), Math.round(y));
  win.show();
  win.focus();
  win.webContents.send("reload");
}

function apply(on) {
  if (on && !registered) {
    try { registered = globalShortcut.register(KEY, show); } catch { registered = false; }
  } else if (!on && registered) {
    globalShortcut.unregister(KEY);
    registered = false;
    if (win && !win.isDestroyed()) win.destroy();
  }
}

function init(prefs) {
  ipcMain.handle("emojipicker:list", async (e) => (win && e.sender === win.webContents ? source() : []));
  ipcMain.handle("emojipicker:copy", async (e, name) => {
    if (!win || e.sender !== win.webContents) return false;
    const x = (await source()).find(v => v.name === String(name));
    if (!x) return false;
    clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(x.png, "base64")));
    hide();
    return true;
  });
  apply(!!prefs.p.emojiPicker);
  prefs.events.on("change", (k, v) => { if (k === "emojiPicker") apply(!!v); });
  app.on("will-quit", () => globalShortcut.unregisterAll());
}

module.exports = { init, setSource, show };
