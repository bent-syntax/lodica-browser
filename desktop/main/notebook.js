// Notebook kept on this device and shared only with your linked devices (the "notes" link category). Several notes. Mirrors the Android Notebook object.
// Nothing goes to the relay. Each note carries `rev` (counts changes on this device, so an open editor notices a note that a linked device changed) and `at` (time of the last edit, decides which side wins when devices merge).
const crypto = require("crypto");
const store = require("./store");
const linkdata = require("./linkdata");

let notes = null;
const listeners = new Set();
const all = () => notes || (notes = (Array.isArray(store.load("notebook", [])) ? store.load("notebook", []) : []).filter((n) => n && typeof n.id === "string"));
const persist = () => { store.save("notebook", () => notes); for (const f of listeners) try { f(); } catch {} };
const title = (n) => (String(n.text || "").split("\n").find((l) => l.trim()) || "").trim().slice(0, 60);
const live = () => all().filter((n) => !n.deleted).sort((a, b) => (b.at || 0) - (a.at || 0));
const info = (n) => ({ id: n.id, title: title(n), at: n.at || 0 });

/** Resolves [{ id, title, at }], newest first. */
async function list() { return live().map(info); }

/** Resolves { id, text, rev, at } of one note, or null when there is none. */
async function get(id) {
  const n = live().find((x) => x.id === id);
  return n ? { id: n.id, text: n.text, rev: n.rev || 0, at: n.at || 0 } : null;
}

/** Saves [text] in note [id] on top of revision [base]. Resolves { id, text, rev, at, conflict } with the newer note when [base] is behind, { gone: true } when the note was deleted on a linked device. */
async function put(id, text, base) {
  const n = all().find((x) => x.id === id);
  if (!n || n.deleted) return { gone: true };
  if (Number.isInteger(base) && base !== (n.rev || 0)) return { id: n.id, text: n.text, rev: n.rev || 0, at: n.at || 0, conflict: true };
  text = String(text == null ? "" : text).slice(0, 200000);
  if (text !== n.text) { n.text = text; n.rev = (n.rev || 0) + 1; n.at = Date.now(); persist(); }
  return { id: n.id, text: n.text, rev: n.rev || 0, at: n.at || 0 };
}

/** Adds an empty note. Resolves the new note. */
async function create() {
  const n = { id: crypto.randomBytes(8).toString("hex"), text: "", rev: 0, at: Date.now() };
  all().push(n); persist();
  return { id: n.id, text: "", rev: 0, at: n.at };
}

/** Deletes note [id]; the delete travels to linked devices. Resolves the remaining list. */
async function remove(id) {
  const n = all().find((x) => x.id === id);
  if (n && !n.deleted) { n.deleted = true; n.text = ""; n.rev = (n.rev || 0) + 1; n.at = Date.now(); persist(); }
  return live().map(info);
}

/** Every note, deleted ones included, for the link sync. */
function everything() { return all().map((n) => ({ ...n })); }

/** Merges notes from a linked device. Returns how many changed here. */
function merge(remote) {
  const r = linkdata.mergeNotes(all(), remote);
  if (r.changed) { notes = r.list; persist(); }
  return r.changed;
}

/** Calls [f] after a note changed on this device. */
function onChange(f) { listeners.add(f); }

module.exports = { list, get, put, create, remove, everything, merge, onChange };
