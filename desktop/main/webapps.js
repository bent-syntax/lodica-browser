// Web apps: a site pinned as its own window, with Desktop and Start Menu shortcuts on Windows.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app, shell, nativeImage, net } = require("electron");
const store = require("./store");

let apps = store.load("webapps", []).filter(a => a && a.id && a.url);
let deps = null;
const persist = () => store.save("webapps", () => apps, 200);
const dir = () => path.join(app.getPath("userData"), "webapps");
const safeName = s => String(s || "Web app").replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Web app";

function icoFromPng(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(size >= 256 ? 0 : size, 6); head.writeUInt8(size >= 256 ? 0 : size, 7);
  head.writeUInt8(0, 8); head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

async function fetchIcon(urls) {
  for (const u of urls) {
    try {
      const r = await net.fetch(u, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      let img = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()));
      if (img.isEmpty()) continue;
      const { width } = img.getSize();
      const size = Math.min(256, Math.max(16, width));
      if (width !== size) img = img.resize({ width: size, height: size, quality: "best" });
      return { png: img.toPNG(), size };
    } catch { /* try next */ }
  }
  return null;
}

function shortcutDirs() {
  return [
    app.getPath("desktop"),
    path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs"),
  ];
}

function writeShortcuts(a) {
  if (process.platform !== "win32") return;
  for (const d of shortcutDirs()) {
    try {
      shell.writeShortcutLink(path.join(d, safeName(a.name) + ".lnk"), "create", {
        target: process.execPath, args: `--app=${a.url}`, description: a.name,
        ...(a.icon ? { icon: a.icon, iconIndex: 0 } : {}),
      });
    } catch (e) { console.error("shortcut", e.message); }
  }
}

function removeShortcuts(a) {
  if (process.platform !== "win32") return;
  for (const d of shortcutDirs()) { try { fs.rmSync(path.join(d, safeName(a.name) + ".lnk"), { force: true }); } catch { /* ignore */ } }
}

async function install() {
  const t = deps.tabs.current();
  if (!t || !/^https?:/.test(t.url) || t.private) return { ok: false, text: "This page can't be installed" };
  const name = safeName(t.title || t.host);
  const id = crypto.createHash("sha1").update(t.url).digest("hex").slice(0, 12);
  let origin = "";
  try { origin = new URL(t.url).origin; } catch { /* checked above */ }
  const icon = await fetchIcon([...(t.icons || []), origin + "/favicon.ico"]);
  let iconPath = "";
  if (icon) {
    try {
      fs.mkdirSync(dir(), { recursive: true });
      iconPath = path.join(dir(), id + ".ico");
      fs.writeFileSync(iconPath, icoFromPng(icon.png, icon.size));
    } catch { iconPath = ""; }
  }
  const a = { id, name, url: t.url, icon: iconPath };
  apps = apps.filter(x => x.id !== id).concat(a);
  persist();
  writeShortcuts(a);
  return { ok: true, name, text: "Installed " + name, app: a };
}

const list = () => apps.map(({ id, name, url, icon }) => ({ id, name, url, icon }));

function open(id) {
  const a = apps.find(x => x.id === id);
  if (a) deps.openApp(a.url);
  return !!a;
}

function remove(id) {
  const a = apps.find(x => x.id === id);
  if (!a) return false;
  removeShortcuts(a);
  if (a.icon) { try { fs.rmSync(a.icon, { force: true }); } catch { /* ignore */ } }
  apps = apps.filter(x => x !== a);
  persist();
  return true;
}

function init(d) { deps = d; }

module.exports = { init, install, list, open, remove };
