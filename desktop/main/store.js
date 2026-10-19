// Small JSON stores in userData with debounced writes; secret stores go through safeStorage.
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const dir = () => app.getPath("userData");
const timers = new Map();

function file(name) { return path.join(dir(), name + ".json"); }

function load(name, fallback) {
  for (const f of [file(name), file(name) + ".bak"]) {
    try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
  }
  return fallback;
}

function writeNow(name, value) {
  const f = file(name);
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(f + ".tmp", JSON.stringify(value));
    try { fs.copyFileSync(f, f + ".bak"); } catch {}
    fs.renameSync(f + ".tmp", f);
  } catch (e) { console.error("store", name, e.message); }
}

/** Saves [name] after 400ms of quiet; [get] is read at write time so the latest state wins. */
function save(name, get, delay = 400) {
  clearTimeout(timers.get(name));
  timers.set(name, setTimeout(() => { timers.delete(name); writeNow(name, get()); }, delay));
}

const pending = new Map();
function saveLater(name, get, delay) { pending.set(name, get); save(name, get, delay); }
function flush() {
  for (const [name, get] of pending) { clearTimeout(timers.get(name)); writeNow(name, get()); }
  pending.clear();
}

// No system keyring (headless Linux): AES-256-GCM with a 0600 key file in userData, marked "LKF1".
const MAGIC = Buffer.from("LKF1");
let fileKey = null;
function localKey() {
  if (fileKey) return fileKey;
  const f = path.join(dir(), ".lodica-key");
  try { fileKey = fs.readFileSync(f); if (fileKey.length === 32) return fileKey; } catch {}
  fs.mkdirSync(dir(), { recursive: true });
  fileKey = require("crypto").randomBytes(32);
  fs.writeFileSync(f, fileKey, { mode: 0o600 });
  return fileKey;
}
function sealLocal(text) {
  const c = require("crypto"), iv = c.randomBytes(12), k = c.createCipheriv("aes-256-gcm", localKey(), iv);
  const ct = Buffer.concat([k.update(text, "utf8"), k.final()]);
  return Buffer.concat([MAGIC, iv, k.getAuthTag(), ct]);
}
function openLocal(buf) {
  const c = require("crypto"), d = c.createDecipheriv("aes-256-gcm", localKey(), buf.subarray(4, 16));
  d.setAuthTag(buf.subarray(16, 32));
  return Buffer.concat([d.update(buf.subarray(32)), d.final()]).toString("utf8");
}
const keyringOk = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };

function loadSecret(name, fallback) {
  const f = path.join(dir(), name + ".bin");
  for (const p of [f, f + ".bak"]) {
    try {
      const buf = fs.readFileSync(p);
      if (buf.subarray(0, 4).equals(MAGIC)) return JSON.parse(openLocal(buf));
      if (!keyringOk()) return fallback;
      return JSON.parse(safeStorage.decryptString(buf));
    } catch {}
  }
  return fallback;
}

function saveSecret(name, value) {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const f = path.join(dir(), name + ".bin");
    try { fs.copyFileSync(f, f + ".bak"); } catch {}
    const text = JSON.stringify(value);
    fs.writeFileSync(f, keyringOk() ? safeStorage.encryptString(text) : sealLocal(text));
    return true;
  } catch (e) { console.error("secret", name, e.message); return false; }
}

module.exports = { load, save: saveLater, flush, loadSecret, saveSecret, writeNow };
