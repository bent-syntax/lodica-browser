// Address bar double-click on the path selects path and query only; pathStart locates it.
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "ui", "js", "bar.js"), "utf8");
const pathStart = new Function(/function pathStart[\s\S]*?\n}\n/.exec(src)[0] + "; return pathStart;")();
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " " + extra)); if (!ok) bad++; };
const u = "https://test.example.com/item=duck?redirect";
check("path slice", u.slice(pathStart(u)) === "/item=duck?redirect", pathStart(u));
check("deleting path leaves domain", u.slice(0, pathStart(u)) === "https://test.example.com");
check("no path", pathStart("https://x.com") === -1);
check("schemeless", "x.com/a".slice(pathStart("x.com/a")) === "/a");
check("search text", pathStart("a b/c") === -1);
process.exit(bad ? 1 : 0);
