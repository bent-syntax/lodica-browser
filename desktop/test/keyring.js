// store.js secrets must round-trip with no system keyring.
const Module = require("module"), fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lk-"));
const orig = Module._load;
Module._load = function (r, ...a) {
  if (r === "electron") return { app: { getPath: () => tmp }, safeStorage: { isEncryptionAvailable: () => false } };
  return orig.call(this, r, ...a);
};
const store = require("../main/store");
assert(store.saveSecret("t", { a: 1 }), "save failed");
assert.deepStrictEqual(store.loadSecret("t", null), { a: 1 });
assert(!fs.readFileSync(path.join(tmp, "t.bin")).toString().includes("\"a\""), "stored in plaintext");
assert.strictEqual(fs.statSync(path.join(tmp, ".lodica-key")).mode & 0o077, 0);
console.log("keyring fallback ok");
