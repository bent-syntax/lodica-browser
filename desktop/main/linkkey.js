"use strict";
// The link key: one random 256-bit key that protects the passwords, authenticator keys and Wi-Fi passwords shared between linked
// devices. It is separate from the link itself, so a device that is linked but has no key sees none of those.
//
// The key moves to a new device when linking: the new device sends a one-off public key (ECDH, P-256), the device that showed the
// linking code asks its user to confirm, then answers with its own one-off public key and the link key wrapped under the shared
// secret. The server only ever sees public keys and the wrapped key, so it cannot read the key or what is sealed with it.
// Nothing here talks to the network: pctabs.js carries the messages.
const crypto = require("crypto");
const store = require("./store");

const b64 = (b) => Buffer.from(b).toString("base64");
const unb64 = (s) => Buffer.from(String(s), "base64");

let state = null; // { key: base64 | null }

function load() {
  if (state) return state;
  const s = store.loadSecret("linkkey", null);
  state = { key: s && typeof s === "object" && typeof s.key === "string" ? s.key : null };
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

/** Keeps [buf] (32 bytes) as the link key. */
function set(buf) { if (!buf || buf.length !== 32) return false; load().key = b64(buf); save(); return true; }

// ---- moving the key (ECDH P-256) ----
/** A one-off key pair. pub is SPKI DER in base64. */
function newPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { pub: b64(publicKey.export({ type: "spki", format: "der" })), priv: privateKey };
}
function wrapKeyOf(priv, peerPub) {
  const pk = crypto.createPublicKey({ key: unb64(peerPub), format: "der", type: "spki" });
  const shared = crypto.diffieHellman({ privateKey: priv, publicKey: pk });
  return crypto.createHmac("sha256", shared).update("lodica-link-key").digest();
}
/** Origin: wraps the link key for the device that sent [peerPub]. Null when this device has no key. */
function wrapFor(peerPub) {
  try {
    if (!hasKey()) return null;
    const mine = newPair();
    return { pub: mine.pub, wrap: b64(seal(keyBuf(), wrapKeyOf(mine.priv, peerPub))) };
  } catch { return null; }
}
/** New device: opens the answer with its private key and keeps the key. */
function adoptWrapped(priv, peerPub, wrap) {
  try { return set(open(unb64(wrap), wrapKeyOf(priv, peerPub))); } catch { return false; }
}
/** Four digits both devices can compare, from the two public keys. */
function fingerprint(joinerPub, originPub) {
  const h = crypto.createHash("sha256").update(String(joinerPub)).update("|").update(String(originPub)).digest();
  return String(h.readUInt32BE(0) % 10000).padStart(4, "0");
}

/** Four digits that name the key, so two devices can see they hold the same one. Null without a key. */
function keyId() {
  const k = keyBuf();
  if (!k) return null;
  const h = crypto.createHash("sha256").update("lodica-keyid|").update(k).digest();
  return String(h.readUInt32BE(0) % 10000).padStart(4, "0");
}

const status = () => ({ hasKey: hasKey(), keyId: keyId() });
function forget() { state = { key: null }; save(); }

module.exports = { hasKey, create, sealData, openData, set, newPair, wrapFor, adoptWrapped, fingerprint, keyId, status, forget };
