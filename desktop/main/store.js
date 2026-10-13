// Small JSON stores in userData with debounced writes; secret stores go through safeStorage.
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const dir = () => app.getPath("userData");
const timers = new Map();

function file(name) { return path.join(dir(), name + ".json"); }

function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), "utf8")); } catch { return fallback; }
}

function writeNow(name, value) {
  const f = file(name);
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(f + ".tmp", JSON.stringify(value));
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

function loadSecret(name, fallback) {
  try {
    const buf = fs.readFileSync(path.join(dir(), name + ".bin"));
    if (!safeStorage.isEncryptionAvailable()) return fallback;
    return JSON.parse(safeStorage.decryptString(buf));
  } catch { return fallback; }
}

function saveSecret(name, value) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), name + ".bin"), safeStorage.encryptString(JSON.stringify(value)));
    return true;
  } catch (e) { console.error("secret", name, e.message); return false; }
}

module.exports = { load, save: saveLater, flush, loadSecret, saveSecret, writeNow };
