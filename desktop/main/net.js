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
    if (/^https?:\/\//i.test(t)) return rest === "/" ? t : new URL(rest, t).toString();
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
  if (!blocker) return cb({});
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
  if (!blocker) return cb({});
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
  const gate = require("./gate").headerFor(hostOf(details.url));
  if (gate) h["X-Lodica-Gate"] = gate;
  const hints = prefs.clientHints(ua);
  for (const k of Object.keys(h)) if (k.toLowerCase().startsWith("sec-ch-ua")) delete h[k];
  if (hints) for (const k of ["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"]) h[k] = hints[k];
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
  if (prefs.p.routeVps && relay.available) {
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
    try { ses.registerPreloadScript({ type: "frame", id: "ghostery", filePath: require.resolve("@ghostery/adblocker-electron-preload") }); }
    catch (e) { console.error("ghostery preload", e.message); }
  }
  ipcMain.handle("@ghostery/adblocker/inject-cosmetic-filters", (...a) => blocker?.onInjectCosmeticFilters(...a));
  ipcMain.handle("@ghostery/adblocker/is-mutation-observer-enabled", (...a) => blocker?.onIsMutationObserverEnabled(...a) ?? false);
  app.on("login", (e, wc, details, authInfo, cb) => {
    if (!authInfo.isProxy || !relay.available || !relay.proxyAuth) return;
    e.preventDefault();
    const [user, ...pass] = Buffer.from(relay.proxyAuth.replace(/^Basic\s+/i, ""), "base64").toString().split(":");
    cb(user, pass.join(":"));
  });
  prefs.events.on("change", key => { if (!key || key === "routeVps") applyProxy(); });
  applyProxy();
  loadBlocker();
  setInterval(() => loadBlocker(), DAY).unref();
}

// The cached list is reused for a day; after that it is fetched again. A failed fetch keeps the cached copy.
function loadBlocker() {
  const file = path.join(app.getPath("userData"), "ghostery.bin");
  const stale = () => { try { return Date.now() - fs.statSync(file).mtimeMs > DAY; } catch { return true; } };
  const make = fresh => ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
    path: file,
    read: fresh ? () => Promise.reject(new Error("stale")) : fs.promises.readFile,
    write: fs.promises.writeFile,
  });
  const apply = b => { blocker = b; };
  (stale() ? make(true).catch(() => make(false)) : make(false))
    .then(apply)
    .catch(e => console.error("ghostery load failed:", e.message));
}

module.exports = { init, VERSION, applyProxy, get loaded() { return !!blocker; } };
