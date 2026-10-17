// Google Authenticator export decoder (otpauth-migration://offline?data=...). Mirror of android engine/TotpMigration.kt.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(buf) {
  let out = "", bits = 0, acc = 0;
  for (const x of buf) {
    acc = (acc << 8) | x; bits += 8;
    while (bits >= 5) { bits -= 5; out += B32[(acc >> bits) & 31]; }
    acc &= (1 << bits) - 1;
  }
  if (bits) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

function reader(b) {
  let i = 0;
  const varint = () => {
    let r = 0, s = 0;
    for (;;) {
      if (i >= b.length || s > 56) throw new Error("bad varint");
      const x = b[i++]; r += (x & 0x7f) * 2 ** s;
      if (!(x & 0x80)) return r;
      s += 7;
    }
  };
  const bytes = () => { const n = varint(); if (i + n > b.length) throw new Error("bad len"); const o = b.subarray(i, i + n); i += n; return o; };
  const skip = w => { if (w === 0) varint(); else if (w === 1) i += 8; else if (w === 2) bytes(); else if (w === 5) i += 4; else throw new Error("wire"); };
  return { varint, bytes, skip, more: () => i < b.length };
}

function otp(b) {
  const r = reader(b);
  let secret = Buffer.alloc(0), name = "", issuer = "", algo = 1, digits = 1, type = 2;
  while (r.more()) {
    const tag = r.varint();
    if (tag === 0x0a) secret = r.bytes();
    else if (tag === 0x12) name = Buffer.from(r.bytes()).toString("utf8");
    else if (tag === 0x1a) issuer = Buffer.from(r.bytes()).toString("utf8");
    else if (tag === 0x20) algo = r.varint();
    else if (tag === 0x28) digits = r.varint();
    else if (tag === 0x30) type = r.varint();
    else r.skip(tag & 7);
  }
  if (type !== 2 || !secret.length) return null;
  const acct = name.includes(":") ? name.slice(name.indexOf(":") + 1).trim() : name;
  const label = [...new Set([issuer, acct].filter(Boolean))].join(" · ") || name || "Account";
  return { label, issuer, name, secret: base32(secret), digits: digits === 2 ? 8 : 6, period: 30, algo: { 2: "SHA256", 3: "SHA512" }[algo] || "SHA1" };
}

/** Entries of an export link, or null when invalid. HOTP entries are skipped. */
function parse(link) {
  const t = String(link || "").trim();
  if (!/^otpauth-migration:\/\//i.test(t)) return null;
  const m = /[?&]data=([^&#]*)/.exec(t);
  if (!m) return null;
  try {
    const data = Buffer.from(decodeURIComponent(m[1].replace(/\+/g, "%2B")).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const r = reader(data), out = [];
    while (r.more()) {
      const tag = r.varint();
      if (tag === 0x0a) { const e = otp(r.bytes()); if (e) out.push(e); } else r.skip(tag & 7);
    }
    return out.length ? out : null;
  } catch { return null; }
}

module.exports = { parse, base32 };
