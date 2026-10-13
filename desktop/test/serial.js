// Drives the real app over CDP: navigator.serial exists in tab + UI, picker prompt fires on requestPort, monitor sheet opens.
// Run: DISPLAY=:97 ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron test/serial.js
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, "..");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "lodica-s-"));
const PORT = 9334;
const bin = path.join(ROOT, "node_modules", "electron", "dist", "electron");
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
const ev = (t, expression, extra = {}) => cdp(t, "Runtime.evaluate", { expression, returnByValue: true, ...extra }).then(r => r.result && r.result.result && r.result.result.value);
let fail = 0;
const check = (n, ok, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fail++; };
app.on("exit", () => {});
(async () => {
  let tab, ui;
  for (let i = 0; i < 40 && !(tab && ui); i++) {
    await sleep(500);
    try { const all = await targets(); tab = all.find(t => t.type === "page" && t.url.startsWith("lodica://search")); ui = all.find(t => t.type === "page" && /ui\/index\.html/.test(t.url)); } catch { /* not up */ }
  }
  check("tab + ui up", !!tab && !!ui);
  await sleep(2000);
  if (!tab || !ui) return;
  check("ui has navigator.serial", await ev(ui, "'serial' in navigator") === true);
  check("openSerial defined", await ev(ui, "typeof openSerial") === "function");
  await ev(ui, "openSerial()");
  await sleep(500);
  check("sheet rendered", await ev(ui, "!!document.querySelector('.ser-log') && !!document.querySelector('.ser-bar select')"));
  // requestPort with no hardware: picker prompt must appear (select dialog), then cancel -> NotFoundError
  const p = ev(ui, "navigator.serial.requestPort().then(()=>'ok',e=>e.name)", { userGesture: true, awaitPromise: true });
  await sleep(1500);
  const dlg = await ev(ui, "(document.querySelector('.dialog')||{}).innerText||''");
  check("picker dialog shown", /serial port/i.test(dlg), dlg.replace(/\n+/g, " | ").slice(0, 100));
  await ev(ui, "[...document.querySelectorAll('.dialog button')].find(b=>/cancel/i.test(b.textContent)).click()");
  const r = await Promise.race([p, sleep(5000).then(() => "timeout")]);
  check("cancel -> NotFoundError", r === "NotFoundError", String(r));
})().catch(e => { console.log("ERR", e); fail++; }).finally(() => { app.kill(); setTimeout(() => process.exit(fail ? 1 : 0), 500); });
