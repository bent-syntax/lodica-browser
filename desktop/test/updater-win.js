// Windows update: the download is followed by a silent setup, with no wizard. Plain node: electron and child_process are faked.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const assert = require("assert");
const Module = require("module");

const spawned = [], opened = [];
const orig = Module._load;
Module._load = function (r, ...a) {
  if (r === "electron") return { app: { quit() {}, getVersion: () => "1.0.0", getPath: () => os.tmpdir() }, shell: { openPath: async (p) => { opened.push(p); return ""; } } };
  if (r === "child_process") return { spawn: (file, args, opts) => { spawned.push({ file, args, opts }); return { on() {}, unref() {} }; } };
  return orig.call(this, r, ...a);
};
const up = require("../main/updater");

const body = crypto.randomBytes(200000);
const sum = crypto.createHash("sha256").update(body).digest("hex");
let port = 0;
const srv = http.createServer((req, res) => {
  if (req.url === "/releases/latest") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ tag_name: "v1.1.0", name: "Lodica 1.1.0", body: "n", assets: [
      { name: "Lodica-Setup-1.1.0.exe", size: body.length, digest: "sha256:" + sum, browser_download_url: "http://127.0.0.1:" + port + "/dl" }] }));
  }
  if (req.url === "/dl") { res.writeHead(200, { "Content-Length": body.length }); return res.end(body); }
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  port = srv.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "updw-"));
  const pushes = [];
  up.init({ ui: { push: (e, d) => pushes.push([e, d && d.state]) } });
  up._setEnv({ api: "http://127.0.0.1:" + port, version: "1.0.0", platform: "win", dir: () => dir });

  let s = await up.check();
  assert.equal(s.state, "available");
  s = await up.download();
  assert.equal(spawned.length, 1, "the setup starts by itself after the download");
  assert.deepStrictEqual(spawned[0].args, ["--updated", "/S", "--force-run"], "silent, keeps settings, starts the new version");
  assert.strictEqual(spawned[0].opts.detached, true);
  assert.ok(spawned[0].file.endsWith("Lodica-Setup-1.1.0.exe"));
  assert.equal(s.state, "installing", "the window stays open with an install state");
  assert.ok(pushes.some(([, st]) => st === "downloading") && pushes.some(([, st]) => st === "installing"), "progress states reach the UI");
  assert.equal(opened.length, 0, "no wizard is opened");
  up._reset();

  // a portable copy is not what the setup installs: it keeps the manual step
  process.env.PORTABLE_EXECUTABLE_FILE = "C:\\x\\Lodica-Portable.exe";
  s = await up.check();
  s = await up.download();
  assert.equal(spawned.length, 1, "no silent setup for a portable copy");
  assert.equal(s.state, "ready");
  assert.equal(await up.install(), true);
  assert.equal(opened.length, 1, "the setup opens for the user instead");
  delete process.env.PORTABLE_EXECUTABLE_FILE;

  srv.close();
  setTimeout(() => process.exit(0), 50);
  console.log("updater-win: all PASS");
})().catch((e) => { console.error(e); process.exit(1); });
