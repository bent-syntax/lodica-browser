// Rust and JS error page logic must agree. Skips when the addon is not built.
const assert = require("assert");
const ep = require("../main/errorpage");
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
const u = ep._js.url("-105", "ERR_NAME_NOT_RESOLVED", "https://a.test/x?y=1&z=<2>");
assert.strictEqual(ep.url("-105", "ERR_NAME_NOT_RESOLVED", "https://a.test/x?y=1&z=<2>"), u);
assert.strictEqual(ep.html(u), ep._js.html(u));
assert.strictEqual(ep.failedOf(u), ep._js.failedOf(u));
const act = "lodica://error/act?a=retry&u=" + encodeURIComponent("https://a.test/");
assert.deepStrictEqual(ep.parseAction(act), ep._js.parseAction(act));
for (const x of [u, act, "https://a.test/", ""]) {
  assert.strictEqual(ep.isErrorUrl(x), ep._js.isErrorUrl(x));
  assert.strictEqual(ep.isActionUrl(x), ep._js.isActionUrl(x));
}
console.log("ok");
