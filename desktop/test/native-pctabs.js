// Rust pctabs helpers (link parsing, command check, payload trim) must match the JS ones. Skips when the addon is not built.
const assert = require("assert");
const os = require("os"), Module = require("module");
const load = Module._load;
Module._load = (r, ...a) => (r === "electron" ? { app: { getPath: () => os.tmpdir(), isPackaged: false }, safeStorage: {}, ipcMain: { handle() {}, on() {} } } : load(r, ...a));
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
const pc = require("../main/pctabs")._js;
const id = Buffer.alloc(16, 7).toString("base64url"), key = Buffer.alloc(32, 9).toString("base64url");
for (const t of [`${id}#${key}`, ` https://x/${id}#${key} `, "nope", `${id}#short`, ""])
  assert.strictEqual(call("pctabs:parseLink", { text: t }), pc.parseLink(t), t);
const now = 1e12, old = [{ at: now - 1000, type: "open", url: "https://a" }, { at: now - 11 * 60e3, type: "close", url: "" }];
for (const c of [{ type: "open", url: "https://b.example" }, { type: "reload" }, { type: "open", url: "ftp://x" }, { type: "zap", url: "https://x" }])
  assert.deepStrictEqual(call("pctabs:control", { cmd: c, old }, now), pc.control(c, old, now), JSON.stringify(c));
const big = "x".repeat(2000);
const mk = () => ({ list: [{ title: "t", url: "https://a", private: false }], chats: Array.from({ length: 400 }, (_, i) => ({ updated: i, text: big })), hist: Array.from({ length: 200 }, () => ({ url: big })), data: { bluetooth: [big], wifi: [] } });
const a = mk(), b = mk();
const rust = JSON.parse(call("pctabs:payload", { tabs: a.list, chats: a.chats, history: a.hist, data: a.data, max: 512 * 1024 }, now));
const js = JSON.parse(pc.payload(b.list, b.chats, b.hist, b.data));
delete rust.updated; delete js.updated;
assert.deepStrictEqual(rust, js);
console.log("native pctabs ok");
