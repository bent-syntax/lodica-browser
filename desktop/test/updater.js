// Updater against a fake relay. Run: node test/updater.js (plain node, no electron).
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const assert = require("assert");
const Module = require("module");
const orig = Module._load;
Module._load = function (r, ...a) { return r === "electron" ? {} : orig.call(this, r, ...a); };
const up = require("../main/updater");

const body = crypto.randomBytes(300000);
const sum = crypto.createHash("sha256").update(body).digest("hex");
let tag = "v1.1.0", badSum = false, port = 0;
const srv = http.createServer((req, res) => {
  if (req.url === "/releases/latest") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ tag_name: tag, name: "Lodica 1.1.0", body: "n", assets: [
      { name: "Lodica-1.1.0.apk", size: 1, digest: "sha256:" + "1".repeat(64), browser_download_url: "http://127.0.0.1:" + port + "/x.apk" },
      { name: "Lodica-1.1.0.AppImage", size: body.length, digest: "sha256:" + (badSum ? "0".repeat(64) : sum), browser_download_url: "http://127.0.0.1:" + port + "/dl" }] }));
  }
  if (req.url.startsWith("/releases?")) {
    const a = (t, o) => Object.assign({ tag_name: t, name: t, body: "n", assets: [{ name: "Lodica-x.AppImage", size: body.length, digest: "sha256:" + sum, browser_download_url: "http://127.0.0.1:" + port + "/dl" }] }, o);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify([a("v1.2.0-beta.1", { prerelease: true }), a("v1.3.0", { draft: true }), a("v1.1.0-beta.2", { prerelease: true }), a("v1.1.0")]));
  }
  if (req.url === "/dl") { res.writeHead(200, { "Content-Length": body.length }); return res.end(body); }
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upd-"));
  const pushes = [];
  port = srv.address().port;
  const env = { api: "http://127.0.0.1:" + port, version: "1.0.0", platform: "linux", dir: () => dir };
  up._setEnv(env);
  let s = await up.check();
  assert.equal(s.state, "available"); assert.equal(s.version, "1.1.0");
  s = await up.download();
  assert.equal(s.state, "ready"); assert(fs.readFileSync(s.path).equals(body));
  assert(!fs.existsSync(s.path + ".part"));
  // checksum mismatch discards the file
  up._reset(); badSum = true;
  await up.check(); s = await up.download();
  assert.equal(s.state, "error"); assert(/Checksum/.test(s.message));
  assert(!fs.readdirSync(dir).some(f => f.endsWith(".part")));
  // up to date
  up._reset(); tag = "v1.0.0"; s = await up.check();
  assert.equal(s.state, "latest");
  // beta channel: newest non-draft, pre-release included
  assert(up.cmp("1.2.0-beta.1", "1.2.0") < 0 && up.cmp("1.2.0-beta.2", "1.2.0-beta.1") > 0 && up.cmp("1.1.0", "1.2.0-beta.1") < 0);
  up._setEnv({ ...env, beta: () => true }); up._reset(); s = await up.check();
  assert.equal(s.state, "available"); assert.equal(s.version, "1.2.0-beta.1");
  // beta off ignores pre-releases (and the list endpoint)
  up._setEnv({ ...env, beta: () => false }); up._reset(); tag = "v1.1.0"; s = await up.check();
  assert.equal(s.version, "1.1.0");
  // unreachable -> error, not crash
  up._setEnv({ ...env, api: "http://127.0.0.1:1" }); up._reset(); s = await up.check();
  assert.equal(s.state, "error");
  fs.rmSync(dir, { recursive: true });
  srv.close();
  console.log("updater: all PASS");
})().catch(e => { console.error("FAIL", e); process.exit(1); });
