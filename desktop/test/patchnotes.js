// Patch notes must cover the current version, stay in descending order, match Android, and leak nothing.
const { readFileSync } = require("fs");
const path = require("path");
let failed = 0;
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " " + (extra || ""))); if (!ok) failed++; };
const root = path.join(__dirname, "..", "..");
const ver = require("../package.json").version;
const gradle = readFileSync(path.join(root, "android/app/build.gradle.kts"), "utf8");
const andVer = (gradle.match(/versionName\s*=\s*"([^"]+)"/) || [])[1];
check("android versionName matches desktop", andVer === ver, andVer + " vs " + ver);
const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
for (const f of ["android/PATCH_NOTES.md", "desktop/PATCH_NOTES.md"]) {
  const s = readFileSync(path.join(root, f), "utf8");
  const heads = [...s.matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]);
  check(f + " has section for " + ver, heads.includes(ver), heads.slice(0, 3).join(","));
  check(f + " newest section is current version", heads[0] === ver, heads[0]);
  check(f + " sorted newest first", heads.every((h, i) => i === 0 || cmp(heads[i - 1], h) > 0), heads.join(","));
  check(f + " no duplicate sections", new Set(heads).size === heads.length);
  // Older sections predate these rules (prose entries, example domains); enforce from 1.9.0 on.
  const recent = s.split(/^## /m).slice(1).filter((b) => { const v = (b.match(/^(\d+\.\d+\.\d+)\s*$/m) || [])[1]; return v && cmp(v, "1.9.0") >= 0; });
  const body = recent.join("\n");
  check(f + " every recent section has a bullet", recent.every((b) => /^\s*[-*] /m.test(b)));
  check(f + " no IPs", !/\b\d{1,3}(\.\d{1,3}){3}\b/.test(body));
  check(f + " no secrets", !/(ghp_|github_pat_|BEGIN [A-Z ]*PRIVATE|password\s*[:=]|token\s*[:=])/i.test(s));
  check(f + " no domains", !/https?:\/\/|\b[a-z0-9-]+\.(com|net|org|be|io|dev|app)\b/i.test(body.replace(/\b(Node|node)\.js\b/g, "")));
}
process.exit(failed ? 1 : 0);
