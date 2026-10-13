// Downloads: saved to the Downloads folder, tracked and persisted, resumable.
const fs = require("fs");
const path = require("path");
const { app, shell, session } = require("electron");
const store = require("./store");

let ui = null, seq = Date.now();
let items = store.load("downloads", []).filter(d => d && d.id);
const live = new Map(); // id -> DownloadItem
const resuming = new Map(); // path -> record

for (const d of items) if (d.state === "progressing") d.state = "interrupted";

const persist = () => store.save("downloads", () => items.filter(d => !d.private), 800);
const view = d => ({ id: d.id, name: d.name, url: d.url, state: d.state, received: d.received, total: d.total, path: d.path, time: d.time, paused: !!live.get(d.id)?.isPaused?.() });
const list = () => items.map(view);
let pushTimer = null;
function push(now) {
  clearTimeout(pushTimer);
  if (now) ui?.push("downloads", list());
  else pushTimer = setTimeout(() => ui?.push("downloads", list()), 250);
}

function uniquePath(dir, name) {
  const safe = String(name || "download").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 180) || "download";
  const ext = path.extname(safe), base = safe.slice(0, safe.length - ext.length);
  let p = path.join(dir, safe), n = 1;
  const taken = q => fs.existsSync(q) || fs.existsSync(q + ".download") || items.some(d => d.path === q && d.state === "progressing");
  while (taken(p)) p = path.join(dir, `${base} (${n++})${ext}`);
  return p;
}

function track(item, d) {
  live.set(d.id, item);
  const sync = () => {
    d.received = item.getReceivedBytes();
    d.total = item.getTotalBytes();
    d.urlChain = item.getURLChain();
    d.mimeType = item.getMimeType();
    d.lastModified = item.getLastModifiedTime();
    d.eTag = item.getETag();
  };
  item.on("updated", (e, state) => { sync(); d.state = state; push(); });
  item.once("done", (e, state) => {
    sync();
    d.state = state;
    live.delete(d.id);
    persist(); push(true);
    if (state === "completed" && ui) {
      ui.toast("Downloaded " + d.name, "Open").then(ok => { if (ok) shell.openPath(d.path); }).catch(() => {});
    }
  });
}

function onWillDownload(e, item, wc) {
  const priv = wc?.session && wc.session !== session.defaultSession;
  const resumed = resuming.get(item.getSavePath());
  if (resumed) {
    resuming.delete(item.getSavePath());
    resumed.state = "progressing";
    track(item, resumed);
    item.resume();
    push(true);
    return;
  }
  const dir = app.getPath("downloads");
  const p = uniquePath(dir, item.getFilename());
  item.setSavePath(p);
  const d = {
    id: String(++seq), name: path.basename(p), url: item.getURL(), state: "progressing",
    received: 0, total: item.getTotalBytes(), path: p, time: Date.now(), private: !!priv,
  };
  items.unshift(d);
  if (items.length > 200) items.length = 200;
  track(item, d);
  persist(); push(true);
}

const find = id => items.find(d => d.id === String(id));

function open(id) { const d = find(id); if (d) shell.openPath(d.path).catch(() => {}); return !!d; }
function show(id) { const d = find(id); if (d) shell.showItemInFolder(d.path); return !!d; }
function cancel(id) { const it = live.get(String(id)); if (it) it.cancel(); return !!it; }

function resume(id) {
  const d = find(id);
  if (!d) return false;
  const it = live.get(d.id);
  if (it) { if (it.canResume()) it.resume(); return true; }
  if (d.state !== "interrupted" || !d.urlChain?.length) return false;
  resuming.set(d.path, d);
  try {
    session.defaultSession.createInterruptedDownload({
      path: d.path, urlChain: d.urlChain, mimeType: d.mimeType || "", offset: d.received || 0,
      length: d.total || 0, lastModified: d.lastModified || "", eTag: d.eTag || "",
    });
  } catch (e) { resuming.delete(d.path); return false; }
  return true;
}

function remove(id) {
  const d = find(id);
  if (!d) return false;
  live.get(d.id)?.cancel();
  items = items.filter(x => x !== d);
  persist(); push(true);
  return true;
}

function clear() {
  items = items.filter(d => live.has(d.id));
  persist(); push(true);
  return true;
}

function download(url, ses = session.defaultSession) {
  try { ses.downloadURL(String(url)); return true; } catch { return false; }
}

function init(deps) {
  ui = deps.ui;
  for (const ses of deps.sessions) ses.on("will-download", onWillDownload);
}

module.exports = { init, list, open, show, cancel, resume, remove, clear, download };
