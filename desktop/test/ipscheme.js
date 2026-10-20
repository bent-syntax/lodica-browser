// A bare IP typed in the address bar resolves to http://, hostnames to https://.
const os = require("os");
const Module = require("module");
const orig = Module._load;
Module._load = function (r, ...a) {
  if (r === "electron") return { app: { getPath: () => os.tmpdir(), on() {}, whenReady: () => new Promise(() => {}) }, safeStorage: { isEncryptionAvailable: () => false } };
  return orig.call(this, r, ...a);
};
const { resolve } = require("../main/prefs");
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " " + extra)); if (!ok) bad++; };
const cases = [
  ["192.168.1.1", "http://192.168.1.1"],
  ["8.8.8.8:8080/x", "http://8.8.8.8:8080/x"],
  ["example.com", "https://example.com"],
  ["1.2.3.4.example.com", "https://1.2.3.4.example.com"],
  ["https://8.8.8.8", "https://8.8.8.8"],
];
for (const [i, o] of cases) { const r = resolve(i, true); check(i, r === o, r); }
process.exit(bad ? 1 : 0);
