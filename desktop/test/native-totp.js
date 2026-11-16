// Rust and JS totp code and link parsing must agree. Skips when the addon is not built.
const assert = require("assert");
const totp = require("../main/totp");
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
const S = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
for (const algo of ["SHA1", "SHA256", "SHA512", "bogus"])
  for (const [digits, period] of [[6, 30], [8, 30], [6, 60]])
    for (const now of [0, 59000, 1700000000000]) {
      const a = { secret: S, digits, period, algo };
      assert.strictEqual(totp.code(a, now), totp._js.code(a, now));
    }
assert.strictEqual(totp.code({ secret: "!!", digits: 6, period: 30, algo: "SHA1" }, 0), "------");
for (const t of [
  "otpauth://totp/Acme:bob%40x.com?secret=jbsw y3dp-ehpk3pxp&issuer=Acme&digits=8",
  "otpauth://totp/solo?secret=JBSWY3DPEHPK3PXP&period=60&algorithm=sha256",
  "otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP", "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=7",
  "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=4", "otpauth://totp/x?secret=!!",
  "JBSWY3DPEHPK3PXP", "jbsw y3dp ehpk 3pxp", "JBSWY3DP", "", "   ",
]) assert.deepStrictEqual(totp.fromText(t), totp._js.fromText(t), t);
console.log("ok");
