// Drives the real app over CDP: Settings -> About shows the update row; Check for updates reaches a terminal state without a relay.
// Run: DISPLAY=:97 ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron test/updateui.js
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, "..");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "lodica-u-"));
const PORT = 9335;
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
  await ev(ui, "openSettings(); SET.tab=\"about\"; renderSettings()");
  await sleep(800);
  const txt = () => ev(ui, "(SET.L&&SET.L.body.innerText)||''");
  check("about shows update row", /update/i.test(await txt()));
  await ev(ui, "inv('update.check')");
  await sleep(2500);
  const st = await ev(ui, "inv('update.status')", { awaitPromise: true });
  check("state settled", st && ["error", "latest", "available"].includes(st.state), JSON.stringify(st).slice(0, 120));
  check("row reflects state", /retry|latest|available|not configured|not available|relay|update/i.test(await txt()));
})().catch(e => { console.log("ERR", e); fail++; }).finally(() => { app.kill(); setTimeout(() => process.exit(fail ? 1 : 0), 500); });
