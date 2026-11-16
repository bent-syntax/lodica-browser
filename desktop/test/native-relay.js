// Rust mail helpers (base domain, code, confirm link, domain cleanup) must match the JS ones. Skips when the addon is not built.
const assert = require("assert");
const os = require("os"), Module = require("module");
const load = Module._load;
Module._load = (r, ...a) => (r === "electron" ? { app: { getPath: () => os.tmpdir(), isPackaged: false }, safeStorage: {}, ipcMain: { handle() {}, on() {} } } : load(r, ...a));
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
const relay = require("../main/relay")._js;
for (const h of ["a.example.co.uk", "example.com", "x.y.example.org", "1.2.3.4", "localhost:80", "", "A.B.Example.COM"])
  assert.strictEqual(call("mail:baseDomain", { host: h }), relay.baseDomain(h), h);
const mails = [
  { subject: "Your code 482 913" },
  { subject: "Verify", text: "Your verification code is 1234, do not share" },
  { subject: "Hi", html: "<p>pin: <b>556677</b></p>" },
  { subject: "Hi", text: "call 555-1234 or 123456 now" },
  { subject: "Hi", text: "nothing here" },
];
for (const m of mails)
  assert.strictEqual(call("mail:code", { subject: m.subject || "", text: m.text || "", html: m.html || "" }), relay.codeOf(m), JSON.stringify(m));
for (const links of [[], ["ftp://x"], ["https://x/privacy", "https://x/verify?t=1"], ["https://x/help", "https://x/a"], ["https://x/terms"]])
  assert.strictEqual(call("mail:confirmLink", { links }), relay.confirmLink({ links }), links.join());
for (const d of ["https://lodica.Example.com/x", " tunnel.example.com:443 ", "example.com", ""])
  assert.strictEqual(call("mail:cleanDomain", { domain: d }), relay.cleanDomain(d), d);
console.log("native relay ok");
process.exit(0);
