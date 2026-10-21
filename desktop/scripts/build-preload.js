// Generates preload/content.js from the Android helper's content.js (read-only source).
// Swaps the Firefox extension APIs for Electron IPC; the page logic stays identical.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = process.env.LODICA_HELPER ||
  path.join(root, "..", "android", "app", "src", "main", "assets", "extensions", "helper", "content.js");
let js = fs.readFileSync(src, "utf8").replace(/\r\n/g, "\n");

function swap(from, to) {
  if (!js.includes(from)) throw new Error("build-preload: pattern not found: " + from.slice(0, 60));
  js = js.split(from).join(to);
}

const SHIM = `
// Electron bridge: the helper "port" talks to the main process over IPC.
const { ipcRenderer, webFrame } = require("electron");
const browser = { runtime: { connectNative() {
  const port = {
    postMessage(m) { ipcRenderer.send("helper", m); },
    onMessage: { addListener(fn) { ipcRenderer.on("helper", (e, m) => fn(m)); } },
    onDisconnect: { addListener() {} },
  };
  ipcRenderer.send("helper", { type: "hello", top: window === window.top, host: location.hostname });
  if (window === window.top) {
    // Mouse buttons 4 and 5 (Linux has no app-command): navigate history.
    window.addEventListener("mouseup", e => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        ipcRenderer.send("helper", { type: "nav", dir: e.button === 3 ? "back" : "forward" });
      }
    }, true);
  }
  return port;
} } };
`;

swap('"use strict";\n', '"use strict";\n' + SHIM);
swap("\n(() => {\n  const TOP", "\nconst lodicaMain = () => {\n  const TOP");
// The first IIFE becomes a function run once the document is ready. Later IIFEs (touch
// gestures) stay as they are, so only the first closing line is rewritten.
if (!js.includes("\n})();\n")) throw new Error("build-preload: IIFE end not found");
js = js.replace("\n})();\n", "\n};\n");
js += `if (/^https?:$/.test(location.protocol)) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lodicaMain, { once: true });
  else lodicaMain();
}
`;
swap("openOrClosedShadowRoot", "shadowRoot");

// YouTube player API lives in the page's main world.
swap(`    const el = document.getElementById("movie_player");
    const pl = el && el.wrappedJSObject;
    let levels = [];
    try { levels = pl && pl.getAvailableQualityLevels ? Array.from(pl.getAvailableQualityLevels()) : []; } catch (e) { /* not ready */ }
    if (!levels.length) {`, `    webFrame.executeJavaScript('(()=>{const p=document.getElementById("movie_player");try{return p&&p.getAvailableQualityLevels?Array.from(p.getAvailableQualityLevels()):[]}catch(e){return []}})()')
      .then((levels) => pickQuality(levels || [], want, tries), () => pickQuality([], want, tries));
  }
  function pickQuality(levels, want, tries) {
    if (!levels.length) {`);
swap(`    try {
      if (pl.getPlaybackQuality && pl.getPlaybackQuality() === pick) return;
      if (pl.setPlaybackQualityRange) pl.setPlaybackQualityRange(pick, pick);
      if (pl.setPlaybackQuality) pl.setPlaybackQuality(pick);
    } catch (e) { /* player API changed */ }`, `    const q = JSON.stringify(pick);
    webFrame.executeJavaScript('(()=>{const p=document.getElementById("movie_player");try{if(!p||p.getPlaybackQuality&&p.getPlaybackQuality()===' + q +
      ')return;if(p.setPlaybackQualityRange)p.setPlaybackQualityRange(' + q + ',' + q + ');if(p.setPlaybackQuality)p.setPlaybackQuality(' + q + ')}catch(e){}})()').catch(() => {});`);

swap(`  async function loadDictText(l) { return (await fetch(browser.runtime.getURL("dict/" + l + ".txt"))).text(); }`,
  `  function loadDictText(l) { return ipcRenderer.invoke("dict", l); }`);

swap(`  try {
    browser.storage.local.get("page").then((r) => usePage(r.page), () => {});
    browser.storage.onChanged.addListener((ch) => { if (ch.page) usePage(ch.page.newValue); });
  } catch (e) { /* storage unavailable */ }`, `  ipcRenderer.invoke("page").then(usePage, () => {});
  ipcRenderer.on("page", (e, p) => usePage(p));`);

if (/browser\.storage|wrappedJSObject|openOrClosed/.test(js)) throw new Error("build-preload: Firefox API left");
fs.mkdirSync(path.join(root, "preload"), { recursive: true });
fs.writeFileSync(path.join(root, "preload", "content.js"), js);
console.log("preload/content.js generated");
