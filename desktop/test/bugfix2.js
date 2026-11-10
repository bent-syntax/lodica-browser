// Plain-node checks for the second bug-fix round: totp parsing, risky words, prefs url resolve.
const assert = require("assert");
const Module = require("module"), load = Module._load;
Module._load = function (r, ...a) { return r === "electron" ? new Proxy({}, { get: () => new Proxy(function () {}, { get: () => () => ({}) }) }) : load.call(this, r, ...a); };
const t = require("../main/totp");
const u = "otpauth://totp/A:b?secret=JBSWY3DPEHPK3PXP";
assert(t.fromText(u));
for (const bad of ["&digits=7", "&period=0", "&algorithm=MD5"]) assert.strictEqual(t.fromText(u + bad), null, bad);
assert(t.fromText(u + "&digits=8&algorithm=sha256&period=60"));
assert.strictEqual(t.fromText("hello world"), null);
assert.strictEqual(t.fromText("JBSWY3DP"), null);
assert(t.fromText("JBSWY3DPEHPK3PXP"));
const { RISKY } = require("../main/aiagent");
for (const w of ["Check out", "Afrekenen", "Kaufen", "Comprar"]) assert(RISKY.test(w), w);
for (const w of ["Search", "Next page"]) assert(!RISKY.test(w), w);
console.log("bugfix2 ok");

// #30/#31/#38
{
  const assert = require("assert"), keys = require("../main/keys");
  assert(!keys.valid("Ctrl") && !keys.valid("Ctrl+Ctrl") && !keys.valid("Dead") && keys.valid("Ctrl+W") && keys.valid("Ctrl++"));
  assert.deepStrictEqual(keys.bind({}, "newTab", ["Ctrl+W", "Ctrl+W"]).newTab, ["Ctrl+W"]);
  assert.strictEqual(keys.fromInput(null), "");
  console.log("ok keys");
}
{
  const tmp = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "h-"));
  globalThis.__tmp = tmp;
  const prev = Module._load;
  Module._load = function (r, ...a) { return r === "electron" ? { app: { getPath: () => tmp } } : prev.call(this, r, ...a); };
  const h = require("../main/history");
  Module._load = prev;
  h.merge([{ url: "https://evil.test/", time: 9e15, visits: -5, title: {} }, { url: "https://x.test/", time: "abc" },
    { url: "https://ok.test/", time: Date.now() - 1000, visits: -5, title: {} }]);
  const l = h.recent(1000);
  const urls = (Array.isArray(l) ? l : l.items || []).map(e => e.url);
  assert(!urls.includes("https://evil.test/") && !urls.includes("https://x.test/"));
  const ok = (Array.isArray(l) ? l : l.items || []).find(e => e.url === "https://ok.test/");
  assert(ok && ok.visits === 1 && ok.title === "https://ok.test/");
  console.log("ok history");
}
{
  const tmp = globalThis.__tmp; // store.js caches the electron stub from the history block
  require("fs").writeFileSync(require("path").join(tmp, "permissions.json"), JSON.stringify({ "a.test|media:true:false": true }));
  const prev = Module._load;
  Module._load = function (r, ...a) { return r === "electron" ? { app: { getPath: () => tmp }, session: {}, Notification: function () {}, webContents: {} } : prev.call(this, r, ...a); };
  const p = require("../main/perms");
  Module._load = prev;
  const wc = { session: {}, getURL: () => "https://a.test/" };
  if (p.check) {
    assert.strictEqual(p.check(wc, "media", "https://a.test/", { mediaType: "video" }), true);
    assert.strictEqual(p.check(wc, "media", "https://a.test/", { mediaType: "audio" }), false);
    console.log("ok perms");
  }
}

{
  const Module = require("module");
  const prev = Module._load;
  Module._load = function (r, ...a) { return r === "electron" ? new Proxy({ app: { getPath: () => globalThis.__tmp } }, { get: (t, k) => t[k] || new Proxy(function () {}, { get: () => () => {} }) }) : prev.call(this, r, ...a); };
  const x = require("../main/extensions");
  Module._load = prev;
  const msg = f => { try { f(); return "none"; } catch (e) { return e.message; } };
  assert.strictEqual(msg(() => x._crxToZip(Buffer.from("Cr24"))), "Broken extension archive");
  const z = Buffer.alloc(30); z.writeUInt32LE(0x06054b50, 0); z.writeUInt16LE(1, 10); z.writeUInt32LE(500, 16);
  assert.strictEqual(msg(() => x._unzip(z, require("os").tmpdir() + "/x37")), "Broken extension archive");
  assert.strictEqual(msg(() => x._crxToZip(Buffer.from("junk"))), "Not a Chrome extension file");
  console.log("ok extensions");
}

{
  const Module = require("module");
  const prev = Module._load;
  Module._load = function (r, ...a) { return r === "electron" ? new Proxy({ app: { getPath: () => globalThis.__tmp } }, { get: (t, k) => t[k] || new Proxy(function () {}, { get: () => () => {} }) }) : prev.call(this, r, ...a); };
  const pr = require("../main/prefs");
  Module._load = prev;
  const r = pr.resolve;
  assert.ok(r("foo.com.").startsWith("https://foo.com."));
  assert.ok(!r("192.168.1.1:99999").startsWith("http://192"));
  assert.ok(r("192.168.1.1:8080").startsWith("http://192.168.1.1:8080"));
  assert.ok(!r("http://").startsWith("http://"));
  assert.ok(!r("https://  x").startsWith("https://  x"));
  assert.ok(r("https://a.test/x").startsWith("https://a.test/x"));
  console.log("ok prefs");
}

{
  const Module = require("module");
  const prev = Module._load;
  Module._load = function (r, ...a) { return r === "electron" ? new Proxy({ app: { getPath: () => globalThis.__tmp }, clipboard: {} }, { get: (t, k) => t[k] || new Proxy(function () {}, { get: () => () => {} }) }) : prev.call(this, r, ...a); };
  const v = require("../main/vault");
  Module._load = prev;
  assert.ok(v.setPin("1234") && v.state().unlocked);
  v.lock();
  assert.ok(!v.setPin("0000") && !v.setPin("0000", "9999") && !v.state().unlocked);
  assert.ok(v.setPin("5678", "1234") && !v.state().unlocked);
  for (let i = 0; i < 5; i++) v.unlock("bad0");
  assert.ok(!v.unlock("5678"), "locked out after 5 fails");
  console.log("ok vault");
}
