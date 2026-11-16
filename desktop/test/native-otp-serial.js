// Rust and JS otpmigration and serial logic must agree. Skips when the addon is not built.
const assert = require("assert");
const otp = require("../main/otpmigration");
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
const inner = Buffer.from([0x0a, 4, 1, 2, 3, 4, 0x12, 8, ...Buffer.from("Mail:bob"), 0x1a, 1, 0x58, 0x20, 2, 0x28, 2, 0x30, 2]);
const data = Buffer.concat([Buffer.from([0x0a, inner.length]), inner]).toString("base64");
for (const l of ["otpauth-migration://offline?data=" + encodeURIComponent(data), "otpauth-migration://offline?data=", "nope", "", "otpauth-migration://offline?data=%%%"])
  assert.deepStrictEqual(otp.parse(l), otp._js.parse(l));
assert.ok(otp.parse("otpauth-migration://offline?data=" + encodeURIComponent(data)));
const serial = require("../main/serial")._js;
const rs = (c, a) => call(c, a);
for (const u of ["https://a.example:8443/x", "file:///tmp/a.html", "garbage", ""])
  assert.strictEqual(rs("serial:originOf", { url: u }), serial.originOf(u));
for (const d of [{ vendorId: 1, productId: 2, serialNumber: "s", portName: "COM3" }, { name: "n" }, {}]) {
  assert.strictEqual(rs("serial:keyOf", { type: "usb", device: d }), serial.keyOf("usb", d));
  assert.strictEqual(rs("serial:label", { device: d }), serial.label(d));
}
console.log("ok");
