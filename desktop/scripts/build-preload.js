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
if (!js.includes("\n(() => {\n")) throw new Error("build-preload: first IIFE not found");
js = js.replace("\n(() => {\n", "\nconst lodicaMain = () => {\n"); // first one only
// The first IIFE becomes a function run once the document is ready. Later IIFEs (touch
// gestures) stay as they are, so only the first closing line is rewritten.
if (!js.includes("\n})();\n")) throw new Error("build-preload: IIFE end not found");
js = js.replace("\n})();\n", "\n};\n");
js += `if (/^https?:$/.test(location.protocol) || (location.protocol === "lodica:" && location.hostname === "pdf" && /\\/viewer\\.html$/.test(location.pathname))) {
  const lodicaStart = () => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lodicaMain, { once: true });
    else lodicaMain();
  };
  if (window === window.top) lodicaStart();
  else {
    // Embedded frames (ads, widgets, every Speedometer test) get no observers: in each iframe they cost half the score.
    // Like the Android frame probe, the full helper starts only in a frame that holds a sign-in field or a consent dialog,
    // or once a text field in it gets focus.
    const FIELD = 'input[type=password],input[type=email],input[inputmode=email],input[autocomplete*=email],'
      + 'input[autocomplete*=username],input[autocomplete*=one-time-code],input[name*=mail i],input[id*=mail i]';
    let n = 0, started = false;
    const go = () => { if (started) return; started = true; removeEventListener("focusin", onFocus, true); lodicaStart(); };
    const onFocus = (e) => { const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) go(); };
    const want = () => {
      if (document.querySelector(FIELD)) return true;
      const b = document.body;
      return !!b && b.textContent.length < 6000 && /cookie|consent|privacy|gdpr|toestemming|einwilligung/i.test(b.textContent);
    };
    const check = () => { if (started) return; if (want()) go(); else if (++n < 3) setTimeout(check, 1500); };
    addEventListener("focusin", onFocus, true);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check, { once: true }); else check();
  }
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

// Translation: pages cannot call the translate services (CORS), so lookups go through the main process, which also
// offers Claude. Dutch and French translate into each other.
swap('  const trFetch = (u) => fetch(u).then((r) => r.json());', '  const trFetch = (u) => ipcRenderer.invoke("fetchJson", u);');
swap('const TR_TARGET = { en: "nl", nl: "en", fr: "en" };', 'const TR_TARGET = { en: "nl", nl: "fr", fr: "nl" };');
swap(`    try {
      const j = await trFetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=" + (det || "Autodetect") + "|" + to);
      out.text = (j && j.responseData && j.responseData.translatedText) || "";
    } catch (e) { /* offline */ }`, `    try { out.text = (await ipcRenderer.invoke("translate", { text, from, to })) || ""; } catch (e) { /* offline */ }`);
swap("if (s.text.length > 200) return;", "if (s.text.length > 200 || page.selTranslate) return;");
// With the setting on, preload/translate.js translates the selection by itself, so the bubble keeps only the read-aloud button.

if (/browser\.storage|wrappedJSObject|openOrClosed/.test(js)) throw new Error("build-preload: Firefox API left");
// Desktop-only code with no Android counterpart lives in scripts/overlay/ so regenerating keeps it.
const overlay = (f) => fs.readFileSync(path.join(__dirname, "overlay", f), "utf8");
const ipcLine = 'const { ipcRenderer, webFrame } = require("electron");\n';
swap(ipcLine, ipcLine + overlay("google-ua.js"));
js += overlay("draw.js");
js += overlay("qrhover.js");
fs.mkdirSync(path.join(root, "preload"), { recursive: true });
fs.writeFileSync(path.join(root, "preload", "content.js"), js);
console.log("preload/content.js generated");

// The checkout coupon finder is shared with Android too; its one message goes to main over IPC.
const csrc = path.join(path.dirname(src), "coupons.js");
const coupons = fs.readFileSync(csrc, "utf8").replace(/\r\n/g, "\n");
if (!coupons.startsWith('"use strict";\n')) throw new Error("build-preload: coupons.js must start with use strict");
fs.writeFileSync(path.join(root, "preload", "coupons.js"), '"use strict";\n// Generated by scripts/build-preload.js from the Android helper\'s coupons.js. Edit that file, not this one.\n' +
  'const { ipcRenderer } = require("electron");\nconst browser = { runtime: { sendMessage: (m) => ipcRenderer.invoke("coupons", String((m && m.site) || "")) } };\n' +
  coupons.slice('"use strict";\n'.length));
console.log("preload/coupons.js generated");
