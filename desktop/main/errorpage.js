// Internal error page (lodica://error/) shown when a main-frame load fails, plus the crash log.
// Buttons are plain links to lodica://error/act?a=...&u=...; tabs.js intercepts them in will-navigate.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const PREFIX = "lodica://error/";
const ACT = PREFIX + "act";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const HINTS = {
  "-105": "The server name could not be resolved. Check the address and your connection.",
  "-106": "You appear to be offline.",
  "-102": "The server refused the connection.",
  "-118": "The connection timed out.",
  "-200": "The site's certificate is not trusted.",
  "-201": "Your system clock may be wrong, or the certificate is not valid yet.",
  "-202": "The site's certificate is not trusted.",
  "-501": "The site's certificate is not trusted.",
  "-310": "The site redirected too many times.",
  "-324": "The server closed the connection without sending data.",
};

function link(a, u, label, cls) {
  return `<a class="${cls}" href="${ACT}?a=${a}&u=${encodeURIComponent(u)}">${label}</a>`;
}

function url(code, desc, failed) {
  return PREFIX + "?c=" + encodeURIComponent(code) + "&d=" + encodeURIComponent(desc || "") + "&u=" + encodeURIComponent(failed || "");
}

function isErrorUrl(u) { return typeof u === "string" && u.startsWith(PREFIX) && !u.startsWith(ACT); }
function isActionUrl(u) { return typeof u === "string" && u.startsWith(ACT); }

function failedOf(u) {
  try { return new URL(u).searchParams.get("u") || ""; } catch { return ""; }
}

function parseAction(u) {
  try {
    const p = new URL(u).searchParams;
    return { action: p.get("a") || "", url: p.get("u") || "" };
  } catch { return { action: "", url: "" }; }
}

function html(u) {
  let code = "", desc = "", failed = "";
  try {
    const p = new URL(u).searchParams;
    code = p.get("c") || ""; desc = p.get("d") || ""; failed = p.get("u") || "";
  } catch { /* empty page */ }
  const hint = HINTS[code] || "The page could not be loaded.";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Page not loaded</title>
<style>
body{font:15px system-ui,sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f6f6f7;color:#222}
main{max-width:560px;padding:32px}
h1{font-size:22px;margin:0 0 8px}
p{margin:6px 0;line-height:1.45}
code{background:#e8e8ea;padding:1px 6px;border-radius:4px;word-break:break-all}
.btns{margin-top:20px;display:flex;gap:8px;flex-wrap:wrap}
a{padding:8px 14px;border-radius:8px;text-decoration:none;border:1px solid #bbb;color:#222;background:#fff}
a.pri{background:#2563eb;border-color:#2563eb;color:#fff}
@media(prefers-color-scheme:dark){body{background:#1c1c1e;color:#eee}code{background:#333}a{background:#2a2a2c;color:#eee;border-color:#555}}
</style></head><body><main>
<h1>This page did not load</h1>
<p>${esc(hint)}</p>
<p><code>${esc(desc || "ERR")}</code> (code ${esc(code)})</p>
<p><code>${esc(failed)}</code></p>
<div class="btns">
${link("retry", failed, "Retry", "pri")}
${link("noblock", failed, "Try without blockers", "")}
${link("external", failed, "Open in system browser", "")}
</div></main></body></html>`;
}

function serve(u) {
  return new Response(html(u), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

// Crash log: one line per event, never any page content or credentials.
function crashLog(entry) {
  try {
    const f = path.join(app.getPath("userData"), "crash.log");
    let u = "";
    try { const x = new URL(entry.url || ""); u = x.origin + x.pathname; } catch { /* no url */ }
    fs.appendFileSync(f, JSON.stringify({ time: new Date().toISOString(), kind: entry.kind, reason: entry.reason, exitCode: entry.exitCode, url: u }) + "\n");
  } catch { /* logging must never throw */ }
}

module.exports = { url, html, serve, isErrorUrl, isActionUrl, failedOf, parseAction, crashLog };
