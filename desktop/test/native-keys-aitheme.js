// Rust and JS keys and aitheme logic must agree. Skips when the addon is not built.
const assert = require("assert");
const keys = require("../main/keys");
const ai = require("../main/aitheme");
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
for (const e of [{ key: "t", ctrl: true }, { key: " ", shift: true }, { key: "Shift" }, { key: "PageDown", ctrl: true, alt: true }, { key: "" }])
  assert.strictEqual(keys.combo(e), keys._js.combo(e));
for (const c of ["Ctrl+T", "Ctrl+", "Shift", "F12", "Ctrl++", 5, ""]) assert.strictEqual(keys.valid(c), keys._js.valid(c));
const over = { newTab: ["Ctrl+Y", "bad+"], closeTab: [] };
assert.deepStrictEqual(keys.map(over), keys._js.map(over));
assert.deepStrictEqual(keys.map(), keys._js.map());
assert.deepStrictEqual(keys.bind(over, "find", ["Ctrl+T", "Ctrl+Q"]), keys._js.bind(over, "find", ["Ctrl+T", "Ctrl+Q"]));
assert.deepStrictEqual(keys.list(over), keys._js.list(over));
const t = JSON.stringify({ bg: "#101010", text: "#202020", accent: "#ff0000", accent2: "#00ff00", animation: "glow", tabTexture: "Dots" });
for (const x of [t, "x " + t + " y", "nope", "", JSON.stringify({ dark: JSON.parse(t), light: { bg: "#ffffff", text: "#000000", accent: "#123456", accent2: "#654321" } })])
  assert.deepStrictEqual(ai.parse(x), ai._js.parse(x));
console.log("ok");
