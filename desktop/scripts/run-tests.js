// Runs every desktop/test/*.js in plain node; exits non-zero if any fail. Used as the pre-release gate.
const { readdirSync, readFileSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");
const dir = path.join(__dirname, "..", "test");
const electron = process.env.ELECTRON_BIN || path.join(__dirname, "..", "node_modules", ".bin", "electron");
let failed = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith(".js")).sort()) {
  const file = path.join(dir, f);
  const src = readFileSync(file, "utf8");
  const asNode = /ELECTRON_RUN_AS_NODE/.test(src.slice(0, 400));
  const real = !asNode && /require\("electron"\)/.test(src);
  const cmd = asNode || real ? electron : process.execPath;
  const args = real ? ["--no-sandbox", file] : [file];
  const home = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "lodica-home-"));
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: home + "/.config", DISPLAY: process.env.DISPLAY || ":97", ...(asNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}) };
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 120000, env });
  const ok = r.status === 0;
  if (!ok) { failed++; console.log("FAIL", f, "\n" + (r.stdout + r.stderr).split("\n").slice(-8).join("\n")); }
  else console.log("ok  ", f);
}
console.log(failed ? failed + " failed" : "all passed");
process.exit(failed ? 1 : 0);
