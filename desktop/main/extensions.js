// Chrome extensions: install from the Chrome Web Store by ID or URL, load them into the browsing session at start.
// Electron supports only part of the Chrome extension API, so simple extensions work and complex ones may not.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { app, net, session } = require("electron");
const store = require("./store");

let list = store.load("extensions", []).filter(x => x && /^[a-p]{32}$/.test(x.id));
const persist = () => store.save("extensions", () => list, 200);
const dir = () => path.join(app.getPath("userData"), "extensions");
const ID = /[a-p]{32}/;

const sessions = () => [session.defaultSession];
const loader = ses => (ses.extensions && ses.extensions.loadExtension ? ses.extensions : ses);

/** Pull the 32-letter extension id out of a Web Store URL or a bare id. */
function parseId(input) {
  const s = String(input || "").trim();
  if (/^[a-p]{32}$/.test(s)) return s;
  if (!/^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com)\//i.test(s)) return null;
  const m = s.split(/[?#]/)[0].split("/").reverse().find(p => /^[a-p]{32}$/.test(p));
  return m || null;
}

/** Strip the CRX2/CRX3 header and return the zip bytes. */
function crxToZip(buf) {
  if (buf.length > 4 && buf.toString("latin1", 0, 2) === "PK") return buf;
  if (buf.toString("latin1", 0, 4) !== "Cr24") throw new Error("Not a Chrome extension file");
  const ver = buf.readUInt32LE(4);
  if (ver === 3) return buf.subarray(12 + buf.readUInt32LE(8));
  if (ver === 2) return buf.subarray(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12));
  throw new Error("Unknown extension file version " + ver);
}

/** Minimal zip reader (stored and deflate entries). Rejects paths that leave the target folder. */
function unzip(buf, target) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Broken extension archive");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(target) + path.sep;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Broken extension archive");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    const out = path.resolve(target, name);
    if (!out.startsWith(root)) throw new Error("Unsafe path in extension archive");
    if (name.endsWith("/")) { fs.mkdirSync(out, { recursive: true }); continue; }
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) throw new Error("Unsupported compression in extension archive");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
  }
}

async function download(id) {
  const v = process.versions.chrome || "120.0.0.0";
  const url = "https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=" + v +
    "&x=" + encodeURIComponent("id=" + id + "&uc");
  const r = await net.fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error("Web Store answered " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 100) throw new Error("Extension not found in the Web Store");
  if (buf.length > 60 * 1024 * 1024) throw new Error("Extension is too large");
  return buf;
}

async function loadInto(folder) {
  let ext = null;
  for (const ses of sessions()) ext = await loader(ses).loadExtension(folder, { allowFileAccess: false });
  return ext;
}

async function install(input) {
  const id = parseId(input);
  if (!id) return { ok: false, error: "Paste a Chrome Web Store link or a 32-letter extension ID" };
  if (list.some(x => x.id === id)) return { ok: false, error: "Already installed" };
  const target = path.join(dir(), id);
  try {
    const zip = crxToZip(await download(id));
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    unzip(zip, target);
    const ext = await loadInto(target);
    list.push({ id, name: ext?.name || id, version: ext?.version || "", folder: target, on: true });
    persist();
    return { ok: true, list: view() };
  } catch (e) {
    fs.rmSync(target, { recursive: true, force: true });
    return { ok: false, error: String(e && e.message || e).slice(0, 160) };
  }
}

function unload(x) {
  for (const ses of sessions()) {
    try { loader(ses).removeExtension(x.runtimeId || x.id); } catch { /* not loaded */ }
  }
}

function remove(id) {
  const x = list.find(e => e.id === id);
  if (!x) return view();
  unload(x);
  fs.rmSync(path.join(dir(), id), { recursive: true, force: true });
  list = list.filter(e => e.id !== id);
  persist();
  return view();
}

async function toggle(id) {
  const x = list.find(e => e.id === id);
  if (!x) return view();
  try {
    if (x.on) { unload(x); x.on = false; }
    else { const e = await loadInto(path.join(dir(), id)); x.runtimeId = e?.id; x.on = true; }
  } catch { /* leave state unchanged */ }
  persist();
  return view();
}

const view = () => list.map(({ id, name, version, on }) => ({ id, name, version, on }));

/** Load every enabled extension. Call once after the app is ready. */
async function init() {
  for (const x of list) {
    if (!x.on) continue;
    try { const e = await loadInto(path.join(dir(), x.id)); x.runtimeId = e?.id; } catch (e) { console.error("extension", x.id, e.message); }
  }
}

module.exports = { install, remove, toggle, list: view, init, parseId, _unzip: unzip, _crxToZip: crxToZip };
