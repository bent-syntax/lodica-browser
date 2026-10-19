// Drives the real app over CDP: failed load -> error page -> Retry click; renderer crash -> crash.log + auto-reload.
// Run: DISPLAY=:97 ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron test/errorpage-crash.js
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, "..");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "lodica-t-"));
const PORT = 9333;
const bin = process.env.ELECTRON_BIN || path.join(ROOT, "node_modules", "electron", "dist", "electron");
const app = spawn(bin, [ROOT, "--no-sandbox", "--remote-debugging-port=" + PORT, "--user-data-dir=" + data], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "" }, stdio: "ignore" });
const targets = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json());
async function cdp(t, method, params = {}) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r));
  const res = await new Promise(r => {
    ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id === 1) r(m); });
    ws.send(JSON.stringify({ id: 1, method, params }));
  });
  ws.close();
  return res;
}
let fail = 0;
const check = (n, ok, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fail++; };
(async () => {
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { await sleep(500); try { tab = (await targets()).find(t => t.type === "page" && t.url.startsWith("lodica://search")); } catch { /* not up */ } }
  check("tab up", !!tab);
  if (!tab) return;
  await cdp(tab, "Page.navigate", { url: "http://127.0.0.1:59999/x?token=abc" });
  await sleep(2500);
  let t = (await targets()).find(x => x.url.startsWith("lodica://error/"));
  check("error page shown", !!t, t && t.url.slice(0, 60));
  if (t) {
    const r = await cdp(t, "Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
    const txt = r.result.result.value;
    check("has buttons", /Retry/.test(txt) && /Try without blockers/.test(txt) && /Open in system browser/.test(txt));
    check("has code", /-102/.test(txt), txt.replace(/\n+/g, " | ").slice(0, 160));
    await cdp(t, "Runtime.evaluate", { expression: "document.querySelector('a.pri').click()" });
    await sleep(2500);
    const t2 = (await targets()).find(x => x.url.startsWith("lodica://error/"));
    check("retry reaches error page again (will-navigate intercepted)", !!t2 && !(await targets()).some(x => x.url.includes("error/act")));
    await cdp(t2 || t, "Runtime.evaluate", { expression: "document.querySelectorAll('a')[1].click()" });
    await sleep(2500);
    check("noblock click ok", (await targets()).some(x => x.url.startsWith("lodica://error/")));
  }
  // crash a tab renderer
  const before = (await targets()).find(x => x.url.startsWith("lodica://error/"));
  if (before) await cdp(before, "Page.crash");
  await sleep(4000);
  const log = fs.existsSync(path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Lodica", "crash.log")) ? fs.readFileSync(path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Lodica", "crash.log"), "utf8") : "";
  check("crash.log load-failed", /load-failed/.test(log));
  check("crash.log render-process-gone", /render-process-gone/.test(log), log.split("\n").filter(l => /render-process-gone/.test(l))[0]);
  check("token not logged", !/token=abc/.test(log));
  const tg = await targets();
  check("tab alive after crash", tg.some(x => x.type === "page" && x.url.startsWith("lodica://")));
  check("UI views alive", tg.filter(x => x.type === "page").length >= 3, String(tg.filter(x => x.type === "page").length));
})().catch(e => { console.log("ERR", e.message); fail++; }).finally(() => { app.kill(); console.log(fail ? "FAILED " + fail : "ALL PASS"); setTimeout(() => process.exit(fail ? 1 : 0), 500); });
