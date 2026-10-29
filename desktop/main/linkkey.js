"use strict";
// The link key: one random 256-bit key that protects the passwords, authenticator keys and Wi-Fi passwords shared between linked
// devices. It is separate from the link itself, so a device that is linked but has no key sees none of those.
//
// A key file holds the key wrapped under a one-off file key W. Two ways to move it to a new device:
//  1. Code: the file alone is useless. The new device asks the device that made it (over the link) for W, that device shows a
//     6-digit code, and the new device must send the code back within 30 seconds. One use, three tries, then it is dead.
//     W only travels under a key made from the link secret and the code.
//  2. Cable: a file that carries W itself, to be copied over a USB cable and inserted on the desktop with one button. Whoever
//     holds that file holds the key, so keep it on the cable and delete it afterwards.
// Nothing here talks to the network: pctabs.js carries the messages.
const crypto = require("crypto");
const store = require("./store");

const CODE_MS = 30 * 1000;
const MAX_TRIES = 3;
const b64 = (b) => Buffer.from(b).toString("base64");
const unb64 = (s) => Buffer.from(String(s), "base64");

let state = null; // { key: base64 | null, files: { id: { w: base64, at } } }
const pending = new Map(); // session -> { id, code, exp, tries }

function load() {
  if (state) return state;
  const s = store.loadSecret("linkkey", null);
  state = s && typeof s === "object" ? { key: s.key || null, files: s.files && typeof s.files === "object" ? s.files : {} } : { key: null, files: {} };
  return state;
}
const save = () => store.saveSecret("linkkey", state);

function seal(buf, key) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}
function open(buf, key) {
  if (buf.length < 29) throw new Error("short");
  const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
}

const hasKey = () => !!load().key;
function create() { const s = load(); if (!s.key) { s.key = b64(crypto.randomBytes(32)); save(); } return true; }
const keyBuf = () => (load().key ? unb64(load().key) : null);

/** Protected data: JSON sealed under the link key, as base64. Null when there is no key. */
function sealData(obj) { const k = keyBuf(); return k ? b64(seal(Buffer.from(JSON.stringify(obj), "utf8"), k)) : null; }
/** The other way round. Null when there is no key or the data was sealed under another key. */
function openData(text) { const k = keyBuf(); if (!k || !text) return null; try { return JSON.parse(open(unb64(text), k).toString("utf8")); } catch { return null; } }

/** A key file for this key. With cable = true it carries its own file key. */
function makeFile(cable) {
  create();
  const s = load(), id = crypto.randomBytes(8).toString("hex"), w = crypto.randomBytes(32);
  const file = { v: 1, id, wrapped: b64(seal(keyBuf(), w)) };
  if (cable) file.w = b64(w);
  else { s.files[id] = { w: b64(w), at: Date.now() }; for (const k of Object.keys(s.files)) if (Date.now() - s.files[k].at > 7 * 24 * 3600e3) delete s.files[k]; save(); }
  return JSON.stringify(file);
}
function readFile(text) {
  try {
    const f = JSON.parse(String(text));
    if (!f || f.v !== 1 || !/^[0-9a-f]{16}$/.test(f.id) || typeof f.wrapped !== "string") return null;
    return { id: f.id, wrapped: f.wrapped, w: typeof f.w === "string" ? f.w : null };
  } catch { return null; }
}
/** Unwraps the key of [file] with [w] (base64) and keeps it. False when [w] does not fit. */
function adopt(file, w) {
  try { const k = open(unb64(file.wrapped), unb64(w)); if (k.length !== 32) return false; load().key = b64(k); save(); return true; } catch { return false; }
}

// ---- the one-time code ----
const proofOf = (linkKey, session, code) => crypto.createHmac("sha256", linkKey).update("proof|" + session + "|" + code).digest("base64");
const wrapKeyOf = (linkKey, session, code) => crypto.createHmac("sha256", linkKey).update("wrap|" + session + "|" + code).digest();

/** Device that made the file: a new device asked for file [id]. Returns the code to show, or null when this device made no such file. */
function request(session, id, now = Date.now()) {
  if (!load().files[id]) return null;
  for (const [s, p] of pending) if (now > p.exp) pending.delete(s);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  pending.set(session, { id, code, exp: now + CODE_MS, tries: 0 });
  return code;
}
/** Device that made the file: the new device sent its proof. Returns { wrap } to send back, or { error }. */
function answer(session, proof, linkKey, now = Date.now()) {
  const p = pending.get(session);
  if (!p) return { error: "no code" };
  if (now > p.exp) { pending.delete(session); return { error: "expired" }; }
  if (++p.tries > MAX_TRIES) { pending.delete(session); return { error: "too many tries" }; }
  const want = Buffer.from(proofOf(linkKey, session, p.code)), got = Buffer.from(String(proof));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { error: "wrong code" };
  pending.delete(session);
  const entry = load().files[p.id];
  delete load().files[p.id]; save();                    // one use
  return { wrap: b64(seal(unb64(entry.w), wrapKeyOf(linkKey, session, p.code))) };
}
/** New device: opens the answer with the code that was typed. Returns W (base64) or null. */
function unwrapAnswer(wrap, linkKey, session, code) {
  try { return b64(open(unb64(wrap), wrapKeyOf(linkKey, session, String(code).trim()))); } catch { return null; }
}

const status = () => ({ hasKey: hasKey(), files: Object.keys(load().files).length });
function forget() { state = { key: null, files: {} }; pending.clear(); save(); }

module.exports = { hasKey, create, sealData, openData, makeFile, readFile, adopt, request, answer, unwrapAnswer, proofOf, status, forget, CODE_MS, MAX_TRIES };
