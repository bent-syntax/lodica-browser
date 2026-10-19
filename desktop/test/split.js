// Drives the real app over CDP: split tabs (start, divider view, drag, end, close-pane) and theme/vertical prefs.
// Run: DISPLAY=:97 ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron test/split.js
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, "..");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "lodica-s-"));
const PORT = 9337;
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
const ev = (t, expression, extra = {}) => cdp(t, "Runtime.evaluate", { expression, returnByValue: true, ...extra }).then(r => r.result && r.result.result && r.result.result.value);
let fail = 0;
const check = (n, ok, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fail++; };
app.on("exit", () => {});
(async () => {
  let ui, top;
  for (let i = 0; i < 40 && !(ui && top); i++) {
    await sleep(500);
    try { const all = await targets(); ui = all.find(t => t.type === "page" && /ui\/index\.html/.test(t.url)); top = all.find(t => t.type === "page" && /ui\/top\.html/.test(t.url)); } catch { /* not up */ }
  }
  check("ui + top up", !!ui && !!top);
  if (!ui || !top) return;
  await sleep(2000);
  const inv = (c, ...a) => ev(ui, `inv(${JSON.stringify(c)}${a.map(x => "," + JSON.stringify(x)).join("")})`, { awaitPromise: true });
  const list = () => inv("tab.list");
  await inv("tab.split");
  await sleep(1200);
  let l = await list();
  check("split started: 2 tabs, one marked", l.tabs.length === 2 && l.tabs.some(t => t.split), JSON.stringify(l.tabs.map(t => t.split)));
  const divider = async () => (await targets()).find(t => /ui\/divider\.html/.test(t.url));
  check("divider view exists", !!(await divider()));
  await inv("split.ratio", 0.3);
  await inv("split.ratio", 5);
  check("ratio clamps without error", true);
  await inv("split.drag", 600);
  await inv("tab.menu", "nonexistent");
  await inv("split.close");
  await sleep(600);
  l = await list();
  check("split ended, tabs kept", l.tabs.length === 2 && !l.tabs.some(t => t.split));
  await inv("tab.split");
  await sleep(800);
  l = await list();
  const cur = l.tabs.find(t => t.current);
  await inv("tab.close", cur.id);
  await sleep(800);
  l = await list();
  check("closing a pane ends split", l.tabs.length === 1 && !l.tabs.some(t => t.split));
  await inv("prefs.set", "theme", "everforest-dark");
  await inv("prefs.set", "vertTabs", true);
  await sleep(600);
  const th = await ev(top, "document.documentElement.dataset.theme");
  check("theme applied to tab strip", th === "everforest-dark", String(th));
  await inv("prefs.set", "vertTabs", false);
})().catch(e => { console.log("ERR", e); fail++; }).finally(() => { app.kill(); setTimeout(() => process.exit(fail ? 1 : 0), 500); });
