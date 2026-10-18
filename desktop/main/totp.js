// Authenticator: time based one-time codes. Secrets live in an encrypted store and never reach the UI.
const crypto = require("crypto");
const store = require("./store");
const migration = require("./otpmigration");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let accounts = null; // {id,label,issuer,name,secret,digits,period,algo}

function all() {
  if (!accounts) { accounts = store.loadSecret("authenticator", []); if (!Array.isArray(accounts)) accounts = []; }
  return accounts;
}
const persist = () => store.saveSecret("authenticator", all());

function unbase32(s) {
  const t = String(s).toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, val = 0; const out = [];
  for (const c of t) {
    const i = B32.indexOf(c);
    if (i < 0) return null;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return out.length ? Buffer.from(out) : null;
}

function code(a, now = Date.now()) {
  const key = unbase32(a.secret);
  if (!key) return "------";
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / a.period)));
  const algo = { SHA1: "sha1", SHA256: "sha256", SHA512: "sha512" }[a.algo] || "sha1";
  const h = crypto.createHmac(algo, key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** a.digits).padStart(a.digits, "0");
}

/** An otpauth://totp link, or a bare base32 secret, as an account; null when invalid. */
function fromText(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  if (/^otpauth:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (u.hostname.toLowerCase() !== "totp") return null;
      const name = decodeURIComponent(u.pathname.replace(/^\//, ""));
      const secret = (u.searchParams.get("secret") || "").toUpperCase().replace(/[\s=-]/g, "");
      if (!unbase32(secret)) return null;
      const issuer = u.searchParams.get("issuer") || (name.includes(":") ? name.split(":")[0].trim() : "");
      const acct = name.includes(":") ? name.slice(name.indexOf(":") + 1).trim() : name;
      const digits = Number(u.searchParams.get("digits")) === 8 ? 8 : 6;
      const period = Math.min(300, Math.max(5, Number(u.searchParams.get("period")) || 30));
      const algo = (u.searchParams.get("algorithm") || "SHA1").toUpperCase();
      return { label: [...new Set([issuer, acct].filter(Boolean))].join(" · ") || "Account", issuer, name, secret, digits, period, algo: ["SHA1", "SHA256", "SHA512"].includes(algo) ? algo : "SHA1" };
    } catch { return null; }
  }
  const secret = t.toUpperCase().replace(/[\s=-]/g, "");
  return unbase32(secret) && secret.length >= 8 ? { label: "Account", issuer: "", name: "", secret, digits: 6, period: 30, algo: "SHA1" } : null;
}

/** Adds accounts from text: an otpauth link, an export link from Google Authenticator, or a secret. Returns how many were new. */
function add(text, label) {
  const t = String(text || "").trim();
  const found = /^otpauth-migration:/i.test(t) ? migration.parse(t) : [fromText(t)].filter(Boolean);
  if (!found || !found.length) return 0;
  const list = all(); let n = 0;
  for (const e of found) {
    if (label && found.length === 1) e.label = String(label).slice(0, 80);
    if (list.some(x => x.secret === e.secret)) continue;
    list.push({ id: crypto.randomBytes(6).toString("hex"), ...e }); n++;
  }
  persist();
  return n;
}

/** Decodes the QR code of an image file and adds what it holds. Returns {added, error}. */
function addImage(file) {
  try {
    const { nativeImage } = require("electron");
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) return { added: 0, error: "Could not read that image" };
    const { width, height } = img.getSize();
    const bgra = img.toBitmap(), rgba = new Uint8ClampedArray(bgra.length);
    for (let i = 0; i < bgra.length; i += 4) { rgba[i] = bgra[i + 2]; rgba[i + 1] = bgra[i + 1]; rgba[i + 2] = bgra[i]; rgba[i + 3] = 255; }
    const r = require("jsqr")(rgba, width, height, { inversionAttempts: "attemptBoth" });
    if (!r || !r.data) return { added: 0, error: "No QR code found in that image" };
    const n = add(r.data);
    return n ? { added: n } : { added: 0, error: "That QR code is not an authenticator code, or it was already added" };
  } catch (e) { return { added: 0, error: "Could not read that image" }; }
}

function list() {
  const now = Date.now();
  return all().map(a => ({ id: a.id, label: a.label, code: code(a, now), digits: a.digits, period: a.period, left: a.period - Math.floor(now / 1000) % a.period, host: a.host || "" }));
}
function remove(id) { const l = all(), i = l.findIndex(x => x.id === id); if (i < 0) return false; l.splice(i, 1); return persist(); }
function rename(id, label) { const a = all().find(x => x.id === id); if (!a || !label) return false; a.label = String(label).slice(0, 80); return persist(); }
const base = h => require("./relay").baseDomain(String(h || "").toLowerCase().replace(/^www\./, ""));
/** The account tied to a site, or null. */
function forHost(host) { const b = base(host); return b ? all().find(a => a.host && base(a.host) === b) || null : null; }
function setHost(id, host) { const a = all().find(x => x.id === id); if (!a) return false; a.host = String(host || "").trim().toLowerCase().replace(/^www\./, "").slice(0, 120); return persist(); }
function copy(id) { const a = all().find(x => x.id === id); return a ? code(a) : null; }

module.exports = { forHost, setHost, list, add, addImage, remove, rename, copy, code, fromText };
