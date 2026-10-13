// Loads sign-up test pages in Electron with the generated content preload and reports which ones raise an "email" message.
// Run: electron --no-sandbox test/signup-detect.js (under Xvfb when headless).
const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("http");
const pages = {
  plain: `<form><input type=email name=x></form>`,
  label: `<form><label for=a>E-mail</label><input id=a type=text></form>`,
  late: `<form id=f></form><script>setTimeout(()=>{f.innerHTML='<input type=email>'},1500)</script>`,
  hiddenThenShown: `<div id=d style="display:none"><input type=email></div><script>setTimeout(()=>{d.style.display='block'},1500)</script>`,
  iframe: `<iframe src="/plain" width=400 height=200></iframe>`,
  shadow: `<div id=h></div><script>h.attachShadow({mode:'open'}).innerHTML='<input type=email>'</script>`,
  multistep: `<div id=s1><input type=text name=firstname></div><button id=n onclick="s1.hidden=true;s2.hidden=false">next</button><div id=s2 hidden><input type=email placeholder="Email address"></div><script>setTimeout(()=>n.click(),1200)</script>`,
  signupFocus: `<form action=/signup><input name=username><input type=email><input type=password></form><script>setTimeout(()=>document.querySelector('[type=email]').focus(),800)</script>`,
  animated: `<style>#a{opacity:0;transition:opacity 1s}</style><div id=a><input type=email></div><script>setTimeout(()=>a.style.opacity=1,300)</script>`,
  placeholderOnly: `<form><input type=text placeholder="Enter your email"></form>`,
  ariaOnly: `<form><input type=text aria-label="Email address"></form>`,
  dutch: `<form><input type=text name=emailadres></form>`,
};
const srv = http.createServer((q, r) => {
  const k = q.url.slice(1).split("?")[0];
  r.setHeader("content-type", "text/html");
  r.end(`<!doctype html><title>${k}</title><body>${pages[k] || ""}</body>`);
});
const seen = {};
ipcMain.handle("page", async () => ({}));
ipcMain.on("helper", (e, m) => {
  const u = e.sender.getURL();
  (seen[u] = seen[u] || []).push(m.type + (m.type === "email" ? ":" + m.focused : ""));
});
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  await new Promise(r => srv.listen(8765, "127.0.0.1", r));
  const out = {};
  for (const k of Object.keys(pages)) {
    if (k === "plain" && false) continue;
    for (const u in seen) delete seen[u];
    const w = new BrowserWindow({ show: false, webPreferences: { preload: require("path").join(__dirname, "..", "preload", "content.js"), sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: true } });
    try { await w.loadURL("http://127.0.0.1:8765/" + k); } catch (e) { console.log("load err", k, e.message); }
    await new Promise(r => setTimeout(r, 4000));
    const hit = Object.entries(seen).filter(([u]) => u.includes("/" + k) || (k === "iframe" && u.endsWith("/plain"))).flatMap(([, v]) => v);
    out[k] = hit.filter(t => t.startsWith("email")).length ? "FOUND" : "MISS";
    w.destroy();
  }
  console.log(JSON.stringify(out, null, 1));
  app.exit(0);
});
