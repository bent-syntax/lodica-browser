// Password vault behind a PIN; entries live in an encrypted secret store.
const crypto = require("crypto");
const { clipboard } = require("electron");
const store = require("./store");

const UNLOCK_MS = 5 * 60 * 1000;
let entries = null; // {origin,user,pass,saved}
let pin = store.load("vault-pin", null); // {salt,hash}
let unlockedUntil = 0;

function all() {
  if (!entries) { entries = store.loadSecret("vault", []); if (!Array.isArray(entries)) entries = []; }
  return entries;
}
const persist = () => store.saveSecret("vault", all());

const hash = (p, salt) => crypto.scryptSync(String(p), Buffer.from(salt, "hex"), 32).toString("hex");

function pinSet() { return !!pin; }

function setPin(p) {
  if (!p || String(p).length < 4) return false;
  const salt = crypto.randomBytes(16).toString("hex");
  pin = { salt, hash: hash(p, salt) };
  store.writeNow("vault-pin", pin);
  unlockedUntil = Date.now() + UNLOCK_MS;
  return true;
}

/** Checks the PIN without unlocking (also used to unlock private tabs). */
function check(p) {
  if (!pin || !p) return false;
  const a = Buffer.from(hash(p, pin.salt), "hex"), b = Buffer.from(pin.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function unlock(p) {
  if (!check(p)) return false;
  unlockedUntil = Date.now() + UNLOCK_MS;
  return true;
}

const unlocked = () => !pin || Date.now() < unlockedUntil;
function state() { return { pinSet: pinSet(), unlocked: unlocked() }; }
function lock() { unlockedUntil = 0; }

function list() {
  if (!unlocked()) return [];
  return all().map(({ origin, user, saved }) => ({ origin, user, saved })).sort((a, b) => a.origin.localeCompare(b.origin));
}

function save(origin, user, pass) {
  if (!origin || !pass) return false;
  const list = all();
  const e = list.find(x => x.origin === origin && x.user === (user || ""));
  if (e) { e.pass = pass; e.saved = Date.now(); }
  else list.push({ origin, user: user || "", pass, saved: Date.now() });
  return persist();
}

function remove(origin, user) {
  if (!unlocked()) return false;
  const n = all().length;
  entries = all().filter(x => !(x.origin === origin && x.user === (user || "")));
  if (entries.length !== n) persist();
  return entries.length !== n;
}

function find(origin) { return all().filter(x => x.origin === origin); }

function copy(origin, user) {
  if (!unlocked()) return false;
  const e = all().find(x => x.origin === origin && x.user === (user || ""));
  if (!e) return false;
  clipboard.writeText(e.pass);
  setTimeout(() => { if (clipboard.readText() === e.pass) clipboard.writeText(""); }, 30000);
  return true;
}

// Linked devices (linkdata.js): every entry out, other devices' entries merged in (the newer one wins).
function exportAll() { return all().map((e) => ({ ...e })); }
function importMany(list) {
  const r = require("./linkdata").mergePasswords(all(), list);
  if (r.changed) { entries = r.list; persist(); }
  return r.changed;
}

module.exports = { exportAll, importMany, state, pinSet, setPin, check, unlock, lock, list, save, remove, delete: remove, find, copy };
