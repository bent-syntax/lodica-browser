// Synthetic payload only; the secrets below are made up.
const assert = require("assert");
const { parse, base32 } = require("../main/otpmigration");

const v = n => { const o = []; while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return Buffer.from(o); };
const ld = (f, b) => Buffer.concat([v(f << 3 | 2), v(b.length), b]);
const vi = (f, n) => Buffer.concat([v(f << 3), v(n)]);
const entry = (secret, name, issuer, algo, digits, type) => Buffer.concat([ld(1, secret), ld(2, Buffer.from(name)), ld(3, Buffer.from(issuer)), vi(4, algo), vi(5, digits), vi(6, type)]);
const payload = Buffer.concat([
  ld(1, entry(Buffer.from("Hello!\xde\xad\xbe\xef", "latin1"), "alice@example.com", "Example", 1, 1, 2)),
  ld(1, entry(Buffer.from("12345678901234567890"), "Bob", "", 2, 2, 2)),
  ld(1, entry(Buffer.from("hotp"), "skip", "X", 1, 1, 1)),
  vi(2, 1), vi(3, 1), vi(4, 1),
]);
const link = "otpauth-migration://offline?data=" + encodeURIComponent(payload.toString("base64"));

assert.strictEqual(base32(Buffer.from("foobar")), "MZXW6YTBOI");
const r = parse(link);
assert.strictEqual(r.length, 2);
assert.deepStrictEqual(r[0], { label: "Example · alice@example.com", issuer: "Example", name: "alice@example.com", secret: base32(Buffer.from("Hello!\xde\xad\xbe\xef", "latin1")), digits: 6, period: 30, algo: "SHA1" });
assert.strictEqual(r[1].label, "Bob");
assert.strictEqual(r[1].digits, 8);
assert.strictEqual(r[1].algo, "SHA256");
assert.strictEqual(parse("otpauth-migration://offline?data=%%%"), null);
assert.strictEqual(parse("https://x"), null);
assert.strictEqual(parse("otpauth-migration://offline?data=" + encodeURIComponent(payload.subarray(0, 9).toString("base64"))), null);
console.log("otpmigration ok");
