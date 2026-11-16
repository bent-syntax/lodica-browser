// Rust and JS tab helpers must agree. Skips when the addon is not built.
const assert = require("assert");
const os = require("os"), Module = require("module");
const load = Module._load;
Module._load = (r, ...a) => (r === "electron" ? { app: { getPath: () => os.tmpdir() } } : load(r, ...a)); // tabs.js loads store.js, which wants the Electron app
const tabs = require("../main/tabs");
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
const js = tabs._js;
for (const u of ["https://a.example/x.pdf", "file:///t/a.PDF", "https://a.example/b.docx", "https://a.example/", "garbage", "ftp://a/x.pdf", ""]) {
  assert.strictEqual(tabs._js.pdfViewerUrl(u), call("tabs:pdfViewerUrl", { url: u }), u);
  assert.strictEqual(js.fallbackIcon(u), call("tabs:fallbackIcon", { url: u }), u);
  assert.strictEqual(js.isHome(u), call("tabs:isHome", { url: u }), u);
}
for (const u of ["about:blank", "lodica://search/search.html", "lodica://search/search.html?q=a", "https://a.example"])
  assert.strictEqual(js.isHome(u), call("tabs:isHome", { url: u }), u);
for (const u of ["lodica://settings", "LODICA://settings/", " lodica://settings ", "lodica://settings/x"])
  assert.strictEqual(js.isSettingsUrl(u), call("tabs:isSettingsUrl", { url: u }), u);
for (const [b, r] of [[{ x: 0, y: 0, width: 114, height: 50 }, 0.5], [{ x: 10, y: 5, width: 1001, height: 700 }, 0.33], [{ x: 0, y: 0, width: 5, height: 9 }, 0.85]])
  assert.deepStrictEqual(call("tabs:splitRects", { bounds: b, ratio: r, gap: js.GAP }), js.splitRects(b, r));
console.log("native tabs ok");
