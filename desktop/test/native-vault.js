// Rust vault core and Node scrypt must agree, and vault:load/dump must round-trip. Skips when the addon is not built.
const assert = require("assert");
const crypto = require("crypto");
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
const salt = "00112233445566778899aabbccddeeff";
const want = crypto.scryptSync("1234", Buffer.from(salt, "hex"), 32).toString("hex");
const list = [{ origin: "https://a.example", user: "bob", pass: "pw", saved: 5 }];
assert.ok(call("vault:load", { salt, hash: want, list }, 1000));
assert.strictEqual(call("vault:check", { pin: "1234" }, 1000), true);
assert.strictEqual(call("vault:check", { pin: "9999" }, 1000), false);
assert.deepStrictEqual(call("vault:status", {}, 1000), { pinSet: true, unlocked: false });
assert.strictEqual(call("vault:unlock", { pin: "1234" }, 1000), true);
assert.strictEqual(call("vault:status", {}, 2000).unlocked, true);
assert.strictEqual(call("vault:status", {}, 40000).unlocked, false);
assert.deepStrictEqual(call("vault:dump", {}, 1000), { pin: { salt, hash: want }, entries: list });
assert.deepStrictEqual(call("vault:find", { origin: "https://a.example" }, 1000), list);
console.log("native vault ok");
