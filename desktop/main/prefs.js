// App preferences, mirrored from the Android Prefs object.
const { EventEmitter } = require("events");
const store = require("./store");

const ENGINES = {
  DUCKDUCKGO: { label: "DuckDuckGo", query: "https://duckduckgo.com/?q=%s", suggest: "https://duckduckgo.com/ac/?type=list&q=%s" },
  STARTPAGE: { label: "Startpage", query: "https://www.startpage.com/do/search?q=%s", suggest: "https://duckduckgo.com/ac/?type=list&q=%s" },
  BRAVE: { label: "Brave", query: "https://search.brave.com/search?q=%s", suggest: "https://duckduckgo.com/ac/?type=list&q=%s" },
  GOOGLE: { label: "Google", query: "https://www.google.com/search?q=%s", suggest: "https://suggestqueries.google.com/complete/search?client=firefox&q=%s" },
  LODICA: { label: "Lodica Search", query: "lodica://search/search.html?q=%s", suggest: "https://duckduckgo.com/ac/?type=list&q=%s" },
};

const AGENTS = {
  DEFAULT: { label: "Lodica default", value: null },
  CHROME_ANDROID: { label: "Chrome on Android", value: "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36" },
  SAFARI_IPHONE: { label: "Safari on iPhone", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1" },
  CHROME_DESKTOP: { label: "Chrome on Windows", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" },
  FIREFOX_DESKTOP: { label: "Firefox on Windows", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0" },
};

const LANGUAGES = {
  EN: { label: "English", code: "en", accept: ["en-US", "en"] },
  NL: { label: "Nederlands", code: "nl", accept: ["nl-BE", "nl", "en"] },
};

const QUALITIES = [144, 240, 360, 480, 720, 1080, 1440, 2160];
const ALWAYS_COMPAT = new Set(["accounts.google.com", "accounts.youtube.com", "myaccount.google.com", "gds.google.com"]);

const DEFAULTS = {
  search: "", searchFallback: "DUCKDUCKGO", darkPages: true, httpsOnly: true, dummyLogin: true, autoArchiveDays: 14,
  desktopDefault: true, routeVps: false, direct: [], cookieReject: true, speed: 1,
  quality: 720, qualities: {}, userAgent: "DEFAULT", lite: [], compat: [], language: "EN",
  pcTabs: false, ai: false, aiAlways: false, trusted: [], showRedirectOrigin: false,
  siteOverrides: {}, quickSites: [], dnsRules: [], menuPins: null, customTheme: null, autoTop: true, bgHistory: [], noDummy: [], totpSkip: [],
  theme: "system", vertTabs: false, vertWidth: 220, vertCollapsed: true, historySuggest: true,
  bg: { type: "none", value: "", dim: 0, blur: 0 }, keybinds: {}, mouse: { middle: "closeTab", back: "back", forward: "forward" },
};

const events = new EventEmitter();
const p = Object.assign({}, DEFAULTS, store.load("prefs", {}));
// Device-gate enrollment was removed in 1.7.7: drop the old per-device token and host list.
delete p.gatedHosts;
try { require("fs").rmSync(require("path").join(require("electron").app.getPath("userData"), "deviceGate.bin"), { force: true }); } catch {}
// "Dark pages" and "Force dark" were two switches for one thing; either one on keeps dark on.
if (p.forceDark) p.darkPages = true;
delete p.forceDark;
// An empty engine means "not chosen yet": Lodica Search while a server is linked, DuckDuckGo otherwise.
if (p.search && !ENGINES[p.search]) p.search = "";
if (!ENGINES[p.searchFallback] || p.searchFallback === "LODICA") p.searchFallback = "DUCKDUCKGO";
if (!AGENTS[p.userAgent]) p.userAgent = "DEFAULT";
if (!LANGUAGES[p.language]) p.language = "EN";

function persist() { store.save("prefs", () => p); }

/** Sets one pref and tells listeners (net, helper, ui) about it. */
function set(key, value) {
  if (!(key in DEFAULTS)) return;
  p[key] = value;
  persist();
  events.emit("change", key, value);
}

const bare = h => (h || "").replace(/^www\./, "");
const matches = (h, list) => list.some(d => h === d || h.endsWith("." + d));

function qualityFor(host) {
  const h = bare(host);
  for (const [k, v] of Object.entries(p.qualities)) if (h === k || h.endsWith("." + k)) return v;
  return null;
}
function setQuality(host, v) {
  const h = bare(host).replace(/^m\./, "");
  if (!h) return;
  const next = Object.assign({}, p.qualities);
  if (v == null) delete next[h]; else next[h] = v;
  set("qualities", next);
}
function isLite(host) { const h = bare(host); return !!h && p.lite.includes(h); }
function toggleLite(host) {
  const h = bare(host);
  if (!h) return;
  set("lite", p.lite.includes(h) ? p.lite.filter(x => x !== h) : p.lite.concat(h));
}
function isForcedCompat(host) { return ALWAYS_COMPAT.has(bare(host)); }
function isCompat(host) { const h = bare(host); return !!h && (ALWAYS_COMPAT.has(h) || matches(h, p.compat)); }
function setCompat(host, on) {
  const h = bare(host);
  if (!h || p.compat.includes(h) === on) return;
  set("compat", on ? p.compat.concat(h) : p.compat.filter(x => x !== h));
}
function isTrusted(host) { const h = bare(host); return !!h && matches(h, p.trusted); }
function setTrusted(host, on) {
  const h = bare(host);
  if (!h) return;
  set("trusted", on ? [...new Set(p.trusted.concat(h))] : p.trusted.filter(x => x !== h));
}
function addDirect(domains) {
  const next = [...new Set(p.direct.concat(domains.filter(d => d && d.includes("."))))];
  if (next.length !== p.direct.length) set("direct", next);
}

const GOOGLE = /^https?:\/\/(www\.)?google\.[a-z.]+(\/|$)/i;
/** Google picks its UI language from the IP; pin it to the chosen language instead. */
function withLanguage(url) {
  if (!GOOGLE.test(url)) return url;
  try {
    const u = new URL(url);
    const code = LANGUAGES[p.language].code;
    if (u.searchParams.get("hl") === code) return url;
    u.searchParams.set("hl", code);
    return u.toString();
  } catch { return url; }
}

const SCHEMES = ["http://", "https://", "about:", "file://", "data:", "view-source:", "lodica://", "chrome://"];
/** Turns typed text into a URL: keeps URLs, adds https:// to hosts, otherwise searches. */
function resolve(input, lodicaAvailable) {
  const t = (input || "").trim();
  if (!t) return "about:blank";
  if (SCHEMES.some(s => t.toLowerCase().startsWith(s))) return t;
  const host = !t.includes(" ") && (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t) || t.startsWith("localhost"));
  if (host) return withLanguage((t.startsWith("localhost") ? "http://" : "https://") + t);
  const want = p.search || (lodicaAvailable ? "LODICA" : "DUCKDUCKGO");
  let engine = ENGINES[want];
  if (want === "LODICA" && !lodicaAvailable) engine = ENGINES[p.searchFallback];
  return withLanguage(engine.query.replace("%s", encodeURIComponent(t)));
}

/** The query of a Lodica Search page, shown in the address bar instead of its URL. */
function searchQuery(url) {
  if (!url || !url.startsWith("lodica://search/search.html")) return null;
  try { return new URL(url).searchParams.get("q") || null; } catch { return null; }
}

const CHROME_MAJOR = String(process.versions.chrome || "141").split(".")[0];
/** Default desktop identity: plain Chrome on Windows, no "Electron" token, reduced version like real Chrome. */
const DEFAULT_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;
function userAgentValue() { return AGENTS[p.userAgent].value || DEFAULT_UA; }

/** Built-in site overrides. User entries in p.siteOverrides win, so an older saved prefs file never hides these. */
const BUILTIN_OVERRIDES = {
  "classic.minecraft.net": { desktopInput: true },
  "minecraft.net": { desktopInput: true },
};
/** Per-site override for a hostname (exact or parent domain), or null. */
function siteOverride(host) {
  const map = Object.assign({}, BUILTIN_OVERRIDES, p.siteOverrides);
  if (!map || typeof map !== "object" || !host) return null;
  const h = String(host).toLowerCase();
  for (const k of Object.keys(map)) {
    const key = k.toLowerCase();
    if ((h === key || h.endsWith("." + key)) && map[k] && typeof map[k] === "object") return map[k];
  }
  return null;
}

/** UA for a tab: sites marked desktopInput (keyboard-and-mouse games) always get the desktop identity, even in a mobile-site tab. */
function agentFor(tab, host) {
  if (tab && tab.desktop === false && !siteOverride(host || tab.host)?.desktopInput) return AGENTS.CHROME_ANDROID.value;
  return userAgentValue();
}

/** Client hints that match a UA string. null = the UA is not Chromium (Firefox/Safari send none). */
function clientHints(ua) {
  const m = /Chrome\/(\d+)/.exec(ua || "");
  if (!m || /Firefox\//.test(ua)) return null;
  const v = m[1], mobile = /Mobile/.test(ua), android = /Android/.test(ua);
  const brands = [`"Chromium";v="${v}"`, `"Not?A_Brand";v="8"`, `"Google Chrome";v="${v}"`];
  return {
    "sec-ch-ua": brands.join(", "),
    "sec-ch-ua-mobile": mobile ? "?1" : "?0",
    "sec-ch-ua-platform": android ? '"Android"' : '"Windows"',
    "sec-ch-ua-full-version-list": brands.map(b => b.replace(/v="(\d+)"/, 'v="$1.0.0.0"')).join(", "),
    "sec-ch-ua-platform-version": android ? '"14.0.0"' : '"10.0.0"',
    "sec-ch-ua-model": android ? '"K"' : '""',
  };
}
function acceptLanguage() {
  const a = LANGUAGES[p.language].accept;
  return a.map((l, i) => i === 0 ? l : `${l};q=${(1 - i * 0.1).toFixed(1)}`).join(",");
}

module.exports = {
  p, set, events, ENGINES, AGENTS, LANGUAGES, QUALITIES, qualityFor, setQuality, isLite, toggleLite,
  isForcedCompat, isCompat, setCompat, isTrusted, setTrusted, addDirect, withLanguage, resolve, searchQuery,
  userAgentValue, siteOverride, agentFor, clientHints, DEFAULT_UA, acceptLanguage, bare,
};
