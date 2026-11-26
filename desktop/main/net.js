// Network: Ghostery blocking, HTTPS upgrade, lite mode, headers and the VPS proxy.
const fs = require("fs");
const path = require("path");
const { app, ipcMain } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const prefs = require("./prefs");
const relay = require("./relay");

const VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(require.resolve("@ghostery/adblocker-electron/package.json"), "utf8")).version; } catch { return ""; }
})();
const LITE_TYPES = new Set(["image", "media", "font"]);
const DAY = 24 * 3600 * 1000;
// YouTube ad endpoints the shared lists miss. Only checked on youtube hosts.
const YT_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/;
const YT_AD = /\/(pagead\/|api\/stats\/ads|get_midroll_|ptracking|youtubei\/v1\/player\/ad_break)/;
const IP = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])$/i;

let blocker = null, deps = null, sessions = [];

// Ad blocking runs in the browser (the Ghostery lists, strength by Settings) or on the Lodica server, which then refuses ad and tracker
// domains for everything sent through it. Without a linked server it is always the browser. YouTube is handled in the browser either way.
const LEVELS = ["light", "standard", "strict"];
// Performance level "fast" (as on Android) turns the in-browser blocker off; "medium" and "features" keep it.
const fast = () => prefs.p.perfMode === "fast";
const level = () => (LEVELS.includes(prefs.p.adBlockLevel) ? prefs.p.adBlockLevel : "standard");
// Only when the server says it can (a relay from before this feature answers 404 and would refuse the login).
let serverSupport = false;
const serverAds = () => prefs.p.adBlockMode === "server" && relay.available && serverSupport;
async function checkServer() {
  serverSupport = false;
  if (prefs.p.adBlockMode === "server" && relay.available) {
    try { const [status] = await relay.request("GET", "/api/adblock"); serverSupport = status === 200; } catch { /* offline: the browser blocks */ }
  }
  applyProxy();
}

// "Light": the lightest blocking. The browser fetches the server's ad and tracker host list once a day and refuses those hosts
// with one hash lookup per request. No filter engine in memory, no cosmetic scripts in pages, and traffic does not go through
// the server. Without a linked server it falls back to the browser's own lists.
const liteAds = () => prefs.p.adBlockMode === "lite" && relay.available;
let hostSet = null, hostsLevel = "";
function hostBlocked(h) {
  for (let x = h; x;) {
    if (hostSet.has(x)) return true;
    const i = x.indexOf(".");
    if (i < 0) return false;
    x = x.slice(i + 1);
  }
  return false;
}
async function loadHosts() {
  if (!liteAds()) return;
  const lv = level(), file = path.join(app.getPath("userData"), "adhosts-" + lv + ".txt");
  const use = (txt) => {
    const set = new Set();
    for (const line of String(txt).split("\n")) { const h = line.trim(); if (h) set.add(h); }
    if (level() === lv && set.size) { hostSet = set; hostsLevel = lv; }
  };
  let fresh = false;
  try { const st = fs.statSync(file); if (hostsLevel !== lv) use(await fs.promises.readFile(file, "utf8")); fresh = Date.now() - st.mtimeMs < DAY; } catch { /* first run */ }
  if (fresh) return;
  try {
    const [status, buf] = await relay.requestRaw("GET", "/api/adblock/hosts?level=" + lv, 60000);
    if (status === 200 && buf && buf.length) { await fs.promises.writeFile(file, buf); use(buf.toString("utf8")); }
  } catch { /* offline: keep the cached list */ }
}
// The Ghostery page script only runs while Ghostery does the blocking.
function cosmetics(on) {
  for (const ses of sessions) {
    try {
      if (on) ses.registerPreloadScript({ type: "frame", id: "ghostery", filePath: require.resolve("@ghostery/adblocker-electron-preload") });
      else ses.unregisterPreloadScript?.("ghostery");
    } catch { /* already in that state */ }
  }
}
let modeNow = "";
function applyMode() {
  const want = liteAds() ? "lite" : "full";
  if (want === modeNow) return;
  modeNow = want;
  if (want === "lite") { blocker = null; cosmetics(false); loadHosts(); }
  else { hostSet = null; hostsLevel = ""; cosmetics(true); loadBlocker(); }
}

const hostOf = u => { try { return new URL(u).hostname; } catch { return ""; } };
const isLocal = h => !h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || IP.test(h) || !h.includes(".");

// Own domain redirects: [{from, to}], same matching as the Android app.
function ownDns(url) {
  const rules = prefs.p.dnsRules;
  if (!Array.isArray(rules) || !rules.length) return null;
  try {
    const u = new URL(url), h = u.hostname.toLowerCase();
    const r = rules.find(r => {
      const x = String(r && r.from || "").trim().toLowerCase();
      if (!x) return false;
      if (x.startsWith("*.")) return h.endsWith(x.slice(1));
      if (x.startsWith(".")) return h.endsWith(x) || h === x.slice(1);
      return h === x;
    });
    const t = r && String(r.to || "").trim();
    if (!t) return null;
    const rest = u.pathname + u.search + u.hash;
    if (/^https?:\/\//i.test(t)) return rest === "/" ? t : new URL(t).origin + rest;
    const bare = /^[\d.]+(:\d+)?$/.test(t) || t.startsWith("[");
    return (bare ? "http:" : u.protocol) + "//" + t + rest;
  } catch { return null; }
}

function tabOf(details) { try { return deps.tabs.byContents(details.webContents); } catch { return null; } }

function onBeforeRequest(details, cb) {
  const tab = tabOf(details);
  const host = hostOf(details.url);
  if (details.resourceType === "mainFrame" && /^https?:/.test(details.url)) {
    const to = ownDns(details.url);
    if (to && to !== details.url) return cb({ redirectURL: to });
  }
  if (details.resourceType === "mainFrame" && prefs.p.httpsOnly && details.url.startsWith("http://") && !isLocal(host)) {
    return cb({ redirectURL: "https://" + details.url.slice(7) });
  }
  if (!/^https?:/.test(details.url)) return cb({});
  const page = tab?.host || hostOf(details.referrer) || host;
  if (LITE_TYPES.has(details.resourceType) && prefs.isLite(page)) return cb({ cancel: true });
  if (details.resourceType === "mainFrame") return cb({});
  if (!prefs.isTrusted(page) && !prefs.isCompat(page) && YT_HOST.test(host) && YT_AD.test(details.url)) {
    if (tab) { tab.blocked++; deps.tabs.pushTab(tab); }
    return cb({ cancel: true });
  }
  if (liteAds()) {
    if (!hostSet || prefs.isTrusted(page) || prefs.isCompat(page) || (tab?.noBlock && tab.noBlock === page)) return cb({});
    // A site's own hosts stay reachable when it is itself on the list (you opened it on purpose).
    if (!hostBlocked(host) || hostBlocked(page)) return cb({});
    if (tab) { tab.blocked++; deps.tabs.pushTab(tab); }
    if (!tab?.private) deps.meter.blocked(host);
    return cb({ cancel: true });
  }
  if (!blocker || fast() || serverAds()) return cb({});
  if (prefs.isTrusted(page) || prefs.isCompat(page) || (tab?.noBlock && tab.noBlock === page)) return cb({});
  blocker.onBeforeRequest(details, r => {
    if (r && (r.cancel || r.redirectURL)) {
      if (tab) { tab.blocked++; deps.tabs.pushTab(tab); }
      if (!tab?.private) deps.meter.blocked(host);
    }
    cb(r || {});
  });
}

function onHeadersReceived(details, cb) {
  if (!blocker || fast() || serverAds() || liteAds() || !/^https?:/i.test(details.url)) return cb({});
  const tab = tabOf(details);
  const page = tab?.host || hostOf(details.url);
  if (prefs.isTrusted(page) || prefs.isCompat(page) || (tab?.noBlock && tab.noBlock === page)) return cb({});
  blocker.onHeadersReceived(details, cb);
}

function onBeforeSendHeaders(details, cb) {
  const h = details.requestHeaders;
  h["Accept-Language"] = prefs.acceptLanguage();
  const tab = tabOf(details);
  const ua = prefs.agentFor(tab, details.resourceType === "mainFrame" || !tab ? hostOf(details.url) : tab.host);
  h["User-Agent"] = ua;
  const hints = prefs.clientHints(ua);
  for (const k of Object.keys(h)) if (k.toLowerCase().startsWith("sec-ch-ua")) delete h[k];
  if (hints) for (const k of ["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "sec-ch-ua-full-version-list", "sec-ch-ua-platform-version", "sec-ch-ua-model"]) h[k] = hints[k];
  cb({ requestHeaders: h });
}

function onCompleted(details) {
  if (details.fromCache || !deps.meter) return;
  const tab = tabOf(details);
  if (tab?.private) return;
  const len = Number(details.responseHeaders?.["content-length"]?.[0] ?? details.responseHeaders?.["Content-Length"]?.[0]) || 0;
  if (len > 0) deps.meter.used(hostOf(details.url), len);
}

function proxyConfig() {
  if ((prefs.p.routeVps || serverAds()) && relay.available) {
    return { mode: "pac_script", pacScript: "data:application/x-ns-proxy-autoconfig;base64," + Buffer.from(relay.pacScript()).toString("base64") };
  }
  return { mode: "system" };
}

function applyProxy() {
  const cfg = proxyConfig();
  for (const ses of sessions) ses.setProxy(cfg).catch(e => console.error("proxy", e.message));
}

function init(d) {
  deps = d;
  sessions = d.sessions;
  for (const ses of sessions) {
    ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, onBeforeRequest);
    ses.webRequest.onHeadersReceived({ urls: ["<all_urls>"] }, onHeadersReceived);
    ses.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, onBeforeSendHeaders);
    ses.webRequest.onCompleted({ urls: ["<all_urls>"] }, onCompleted);
  }
  // Sites on the allow lists get no injected hiding rules or scriptlets either (Gemini and other web apps break on them).
  ipcMain.handle("@ghostery/adblocker/inject-cosmetic-filters", (e, url, ...a) => {
    if (fast()) return undefined;
    const host = hostOf(url);
    if (host && (prefs.isTrusted(host) || prefs.isCompat(host))) return undefined;
    return blocker?.onInjectCosmeticFilters(e, url, ...a);
  });
  // Cosmetic filters keep watching the DOM only in the top frame. In embedded frames a DOM observer slowed every page script
  // (Speedometer runs each test in an iframe); their ads are mostly stopped by the network filters anyway.
  ipcMain.handle("@ghostery/adblocker/is-mutation-observer-enabled", (e, ...a) => (e.senderFrame && e.senderFrame.parent ? false : blocker?.onIsMutationObserverEnabled(e, ...a) ?? false));
  app.on("login", (e, wc, details, authInfo, cb) => {
    if (!authInfo.isProxy || !relay.available || !relay.proxyAuth) return;
    e.preventDefault();
    const [user, ...pass] = Buffer.from(relay.proxyAuth.replace(/^Basic\s+/i, ""), "base64").toString().split(":");
    // "+ads-<strength>" after the user name asks the server to refuse ad and tracker domains.
    cb(serverAds() ? user + "+ads-" + level() : user, pass.join(":"));
  });
  prefs.events.on("change", key => {
    if (!key || key === "routeVps" || key === "adBlockMode" || key === "adBlockLevel") applyProxy();
    if (key === "adBlockMode" || key === "adBlockLevel" || key === "perfMode") for (const ses of sessions) { try { ses.clearAuthCache?.(); ses.closeAllConnections?.(); } catch { /* closing */ } }
    if (key === "adBlockLevel") { if (liteAds()) loadHosts(); else loadBlocker(); }
    if (key === "adBlockMode") { checkServer(); applyMode(); }
  });
  // The YouTube preload asks whether this site is on the allow lists before it touches the player.
  ipcMain.on("lodica-adblock", (e, host) => { e.returnValue = !(prefs.isTrusted(String(host)) || prefs.isCompat(String(host))); });
  applyProxy();
  applyMode();
  // The server link can come up after start; a daily pass also refreshes whichever list is in use.
  relay.events?.on?.("change", () => applyMode());
  setInterval(() => (liteAds() ? loadHosts() : loadBlocker()), DAY).unref();
  checkServer();
}

// The cached list is reused for a day; after that it is fetched again. A failed fetch keeps the cached copy.
function loadBlocker() {
  const lv = level(), file = path.join(app.getPath("userData"), lv === "standard" ? "ghostery.bin" : "ghostery-" + lv + ".bin");
  const build = lv === "light" ? ElectronBlocker.fromPrebuiltAdsOnly : lv === "strict" ? ElectronBlocker.fromPrebuiltFull : ElectronBlocker.fromPrebuiltAdsAndTracking;
  const stale = () => { try { return Date.now() - fs.statSync(file).mtimeMs > DAY; } catch { return true; } };
  const make = fresh => build.call(ElectronBlocker, fetch, {
    path: file,
    read: fresh ? () => Promise.reject(new Error("stale")) : fs.promises.readFile,
    write: fs.promises.writeFile,
  });
  const apply = b => { if (level() === lv) blocker = b; };
  (stale() ? make(true).catch(() => make(false)) : make(false))
    .then(apply)
    .catch(e => console.error("ghostery load failed:", e.message));
}

module.exports = { init, VERSION, applyProxy, get loaded() { return !!blocker || !!hostSet; } };
