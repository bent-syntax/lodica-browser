// Style guards: the dim layer stays flat, and --muted reaches 4.5:1 on --bg and --raised in every generated theme.
const { readFileSync } = require("fs");
const path = require("path");
let failed = 0;
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " " + (extra || ""))); if (!ok) failed++; };
const ui = path.join(__dirname, "..", "ui");
for (const f of ["ui.css", "polish.css"]) {
  const css = readFileSync(path.join(ui, f), "utf8");
  const dim = [...css.matchAll(/\.layer>\.dim\s*\{[^}]*\}/g)].map((m) => m[0]);
  check(f + " dim layer has no backdrop-filter", dim.every((r) => !/backdrop-filter|filter\s*:/.test(r)), dim.join(" "));
}
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, p) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - p) + parseInt(b.slice(i, i + 2), 16) * p).toString(16).padStart(2, "0")).join("");
for (const f of [path.join(ui, "themes.css"), path.join(__dirname, "..", "search", "themes.css")]) {
  const css = readFileSync(f, "utf8");
  const rules = [...css.matchAll(/:root(\[[^\]]+\])?\{([^}]*)\}/g)].filter((m) => !/Canvas/.test(m[2]) && /--muted:#/.test(m[2]));
  const themes = rules.length;
  check(path.basename(path.dirname(f)) + "/themes.css has themes to check", themes >= 14, String(themes));
  for (const m of rules) {
    const v = Object.fromEntries([...m[2].matchAll(/--([a-z]+):(#[0-9A-Fa-f]{6})/g)].map((x) => [x[1], x[2]]));
    for (const s of ["bg", "raised"]) { const r = ratio(v.muted, v[s]); check((m[1] || ":root") + " muted on " + s + " " + r.toFixed(2), r >= 4.5); }
  }
  // "System colours" theme: muted is 60% CanvasText over Canvas; check a pure light and a pure dark canvas.
  for (const [canvas, text] of [["#FFFFFF", "#000000"], ["#000000", "#FFFFFF"]]) {
    const muted = mix(canvas, text, 0.6), raised = mix(canvas, text, 0.06);
    check("os theme muted on " + canvas + " " + ratio(muted, canvas).toFixed(2) + "/" + ratio(muted, raised).toFixed(2), ratio(muted, canvas) >= 4.5 && ratio(muted, raised) >= 4.5);
  }
}
process.exit(failed ? 1 : 0);
