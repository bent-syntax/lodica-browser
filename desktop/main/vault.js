// Password vault behind a PIN; entries live in an encrypted secret store.
const crypto = require("crypto");
const { clipboard } = require("electron");
const store = require("./store");
const rs = require("./native").call;

const UNLOCK_MS = 30 * 1000;
let entries = null; // {origin,user,pass,saved}
let pin = store.load("vault-pin", null); // {salt,hash}
let unlockedUntil = 0;

function all() {
  if (!entries) { entries = store.loadSecret("vault", []); if (!Array.isArray(entries)) entries = []; }
  return entries;
}
const persist = () => store.saveSecret("vault", all());

const hash = (p, salt) => crypto.scryptSync(String(p), Buffer.from(salt, "hex"), 32).toString("hex");

function pinSetJs() { return !!pin; }

function setPinJs(p, old) {
  if (!p || String(p).length < 4) return false;
  if (pin && !checkJs(old)) return false;
  const first = !pin;
  const salt = crypto.randomBytes(16).toString("hex");
  pin = { salt, hash: hash(p, salt) };
  store.writeNow("vault-pin", pin);
  if (first) unlockedUntil = Date.now() + UNLOCK_MS;
  return true;
}

let fails = 0, blockedUntil = 0;

/** Checks the PIN without unlocking (also used to unlock private tabs). */
function checkJs(p) {
  if (!pin || !p || Date.now() < blockedUntil) return false;
  const a = Buffer.from(hash(p, pin.salt), "hex"), b = Buffer.from(pin.hash, "hex");
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (ok) fails = 0;
  else if (++fails >= 5) { fails = 0; blockedUntil = Date.now() + 30000; }
  return ok;
}

function unlockJs(p) {
  if (!checkJs(p)) return false;
  unlockedUntil = Date.now() + UNLOCK_MS;
  return true;
}

const unlockedJs = () => !pin || Date.now() < unlockedUntil;
function stateJs() { return { pinSet: pinSetJs(), unlocked: unlockedJs() }; }
/** Opens the vault without the PIN after the linked phone and/or the link key vouched for this PC (pctabs.unlockVault). */
function grantJs() { unlockedUntil = Date.now() + UNLOCK_MS; }
function lockJs() { unlockedUntil = 0; }

function listJs() {
  if (!unlockedJs()) return [];
  return all().map(({ origin, user, saved }) => ({ origin, user, saved })).sort((a, b) => a.origin.localeCompare(b.origin));
}

function saveJs(origin, user, pass) {
  if (!origin || !pass) return false;
  const list = all();
  const e = list.find(x => x.origin === origin && x.user === (user || ""));
  if (e) { e.pass = pass; e.saved = Date.now(); }
  else list.push({ origin, user: user || "", pass, saved: Date.now() });
  return persist();
}

function removeJs(origin, user) {
  if (!unlockedJs()) return false;
  const n = all().length;
  entries = all().filter(x => !(x.origin === origin && x.user === (user || "")));
  if (entries.length !== n) persist();
  return entries.length !== n;
}

function find(origin) { return all().filter(x => x.origin === origin); }

function copy(origin, user) {
  if (!unlockedFn()) return false;
  const e = all().find(x => x.origin === origin && x.user === (user || ""));
  if (!e) return false;
  clipboard.writeText(e.pass);
  setTimeout(async () => { try { if ((await clipboard.readText()) === e.pass) clipboard.writeText(""); } catch { /* no clipboard */ } }, 30000); // Electron 44: readText returns a promise
  return true;
}

// Linked devices (linkdata.js): every entry out, other devices' entries merged in (the newer one wins).
function exportAll() { return all().map((e) => ({ ...e })); }
function importMany(list) {
  const r = require("./linkdata").mergePasswords(all(), list);
  if (r.changed) { entries = r.list; hydrated = false; persist(); }
  return r.changed;
}

// Rust core holds the PIN, lockout and unlock state; entries and pin mirror it for the store and the link code.
let hydrated = false;
function hydrate() {
  if (hydrated) return;
  rs("vault:load", { salt: pin ? pin.salt : "", hash: pin ? pin.hash : "", list: all() });
  hydrated = true;
}
const R = (cmd, args) => { hydrate(); return rs(cmd, args); };
function mirror() {
  const d = R("vault:dump", {});
  entries = d.entries;
  return d;
}
function setPinRs(p, old) {
  const salt = crypto.randomBytes(16).toString("hex");
  const ok = R("vault:setPin", { pin: String(p ?? ""), old: String(old ?? ""), salt });
  if (ok) { pin = mirror().pin; store.writeNow("vault-pin", pin); }
  return ok;
}
function saveRs(origin, user, pass) {
  const ok = R("vault:save", { origin: origin || "", user: user || "", pass: pass || "" });
  if (ok) { mirror(); return persist(); }
  return false;
}
function removeRs(origin, user) {
  const ok = R("vault:remove", { origin, user: user || "" });
  if (ok) { mirror(); persist(); }
  return ok;
}

const pinSet = rs ? () => R("vault:status", {}).pinSet : pinSetJs;
const setPin = rs ? setPinRs : setPinJs;
const check = rs ? (p) => R("vault:check", { pin: String(p ?? "") }) : checkJs;
const unlock = rs ? (p) => R("vault:unlock", { pin: String(p ?? "") }) : unlockJs;
const unlockedFn = rs ? () => R("vault:status", {}).unlocked : unlockedJs;
const state = rs ? () => R("vault:status", {}) : stateJs;
const grant = rs ? () => { R("vault:grant", {}); } : grantJs;
const lock = rs ? () => { R("vault:lock", {}); } : lockJs;
const list = rs ? () => R("vault:list", {}) : listJs;
const save = rs ? saveRs : saveJs;
const remove = rs ? removeRs : removeJs;

module.exports = { _js: { setPin: setPinJs, check: checkJs, unlock: unlockJs, state: stateJs, list: listJs, save: saveJs, remove: removeJs }, exportAll, importMany, state, pinSet, setPin, check, unlock, grant, lock, list, save, remove, delete: remove, find, copy };
