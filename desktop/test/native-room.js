// Rust room helpers (names, dm and group ids, labels, remembered names) must match the JS ones. Skips when the addon is not built.
const assert = require("assert");
const os = require("os"), Module = require("module");
const load = Module._load;
Module._load = (r, ...a) => (r === "electron" ? { app: { getPath: () => os.tmpdir(), isPackaged: false }, safeStorage: {}, ipcMain: { handle() {}, on() {} } } : load(r, ...a));
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
const room = require("../main/room")._js;
const names = ["Bob", "a b|c", "x y​z", "", "é".repeat(40), "ALICE", "alice"];
for (const n of names) {
  assert.strictEqual(call("room:clean", { name: n }), room.clean(n), JSON.stringify(n));
  assert.strictEqual(call("room:query", { room: n }), room.roomQ(n), JSON.stringify(n));
  assert.strictEqual(call("room:group", { name: n }), room.group(n), JSON.stringify(n));
  for (const p of names) assert.strictEqual(call("room:dm", { me: n, peer: p }), room.dm(n, p), n + "/" + p);
}
for (const r of ["", "grp:Team", "dm:Bob|alice", "dm:Bob|Bob"])
  assert.strictEqual(call("room:label", { room: r, me: "Bob" }), room.label(r, "Bob"), r);
assert.strictEqual(call("room:isMine", { name: "Bob", current: "Bob", names: [] }), room.isMine("Bob", "Bob", []));
assert.strictEqual(call("room:isMine", { name: "Old", current: "Bob", names: ["Old"] }), room.isMine("Old", "Bob", ["Old"]));
assert.strictEqual(call("room:isMine", { name: "Zed", current: "Bob", names: ["Old"] }), room.isMine("Zed", "Bob", ["Old"]));
assert.strictEqual(call("room:rememberName", { names: ["Bob"], name: "Bob" }), null);
assert.deepStrictEqual(call("room:rememberName", { names: ["Bob"], name: "Al" }), ["Bob", "Al"]);
console.log("native room ok");
process.exit(0);
