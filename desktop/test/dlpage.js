// The download animation script must parse, avoid innerHTML (Trusted Types) and scale its length to the download size. Run: node test/dlpage.js
const assert = require("assert");
const Module = require("module");
const orig = Module._load;
Module._load = function (r, ...a) { return r === "electron" ? {} : orig.call(this, r, ...a); };
const d = require("../main/dlpage");

for (const short of [true, false]) {
  const s = d.script(short, { bg: "#111827", amber: "#F59E0B", text: "#E5E7EB" }, { x: 100, y: 200 }, { x: 900, y: 88 }, "win32");
  new Function(s);
  assert(!/innerHTML/.test(s), "no innerHTML");
  assert(s.includes(short ? "const T = 1500" : "const T = 3000"));
  assert(s.includes("prefers-reduced-motion"));
}
assert(d.CSS.includes("z-index:2147483647"));
console.log("dlpage ok");
