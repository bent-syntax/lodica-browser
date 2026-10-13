"use strict";

// Routes page traffic through the Lodica VPS tunnel when the app turns it on.
// The app owns the setting and the credential; it pushes {type:"config"} over the native port.

let domain = ""; // the relay's domain; the app pushes the real one in the config
let dns = []; // the user's own names: [name, target] pairs from the app

function dnsFor(h) {
  for (const [n, t] of dns) {
    if (n.startsWith("*.") ? h.endsWith(n.slice(1)) : n.startsWith(".") ? (h.endsWith(n) || h === n.slice(1)) : h === n) return t;
  }
  return "";
}

// Own names load from the target: a host or IP keeps the page's scheme (http for a bare IP), a full URL is used as is.
browser.webRequest.onBeforeRequest.addListener((d) => {
  if (!dns.length) return {};
  let u;
  try { u = new URL(d.url); } catch (e) { return {}; }
  const t = dnsFor(u.hostname.toLowerCase());
  if (!t) return {};
  try {
    if (/^https?:\/\//i.test(t)) { const b = new URL(t); return { redirectUrl: new URL(u.pathname + u.search + u.hash, b).href }; }
    const bare = /^[\d.]+(:\d+)?$/.test(t) || t.startsWith("[");
    return { redirectUrl: (bare ? "http:" : u.protocol) + "//" + t + u.pathname + u.search + u.hash };
  } catch (e) { return {}; }
}, { urls: ["http://*/*", "https://*/*"], types: ["main_frame", "sub_frame", "xmlhttprequest", "image", "script", "stylesheet", "media", "font", "other"] }, ["blocking"]);

const tunnel = () => ({ type: "https", host: "tunnel." + domain, port: 3443 });
const DIRECT = { type: "direct" };

// Identity providers and payment flows stay on the device's own connection: they tend to
// flag logins from datacenter IPs, and the phone's IP is the one the user's accounts know.
const DIRECT_HOSTS = [
  "accounts.google.com", "accounts.youtube.com", "myaccount.google.com",
  "login.microsoftonline.com", "login.live.com", "login.microsoft.com",
  "appleid.apple.com", "idmsa.apple.com", "id.apple.com",
  "github.com/login", "auth0.com", "okta.com", "onelogin.com",
  "paypal.com", "stripe.com", "checkout.stripe.com", "pay.google.com",
  "itsme.be", "itsme-id.com",
];
const SENSITIVE = /(log-?in|sign-?in|sign-?on|oauth|sso|checkout|bank)|(^|[^a-z])(auth|account|pay)/i;

let cfg = { enabled: false, auth: "", direct: [], lite: [], api: "", ai: false, theme: null };
let ready;
const configured = new Promise((resolve) => { ready = resolve; });
setTimeout(() => ready(), 2000); // never hold page loads hostage to a missing app

function isPrivateHost(h) {
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (domain && (h === domain || h.endsWith("." + domain))) return true;
  if (dnsFor(h)) return true;
  if (h.startsWith("[")) {
    const v6 = h.slice(1, -1).toLowerCase();
    return v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
  }
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function sensitive(raw) {
  if (!raw) return false;
  let u;
  try { u = new URL(raw); } catch (e) { return false; }
  const host = u.hostname.toLowerCase();
  if (DIRECT_HOSTS.some((d) => host === d || host.endsWith("." + d))) return true;
  // Sites where the user signed in or up: their risk checks reject datacenter IPs.
  if (cfg.direct.some((d) => host === d || host.endsWith("." + d))) return true;
  return SENSITIVE.test(host) || SENSITIVE.test(u.pathname);
}

function decide(details) {
  if (!cfg.enabled || !cfg.auth) return DIRECT;
  let u;
  try { u = new URL(details.url); } catch (e) { return DIRECT; }
  if (!/^(https?|wss?):$/.test(u.protocol)) return DIRECT;
  if (isPrivateHost(u.hostname.toLowerCase())) return DIRECT;
  // A login page keeps all of its requests direct, not just the form post.
  if (sensitive(details.url) || sensitive(details.documentUrl) || sensitive(details.originUrl)) return DIRECT;
  // No direct fallback on purpose: if the tunnel is down, fail rather than leak the real IP.
  return Object.assign({ proxyAuthorizationHeader: cfg.auth }, tunnel());
}

browser.proxy.onRequest.addListener(async (details) => {
  if (!cfg.enabled) await configured;
  return decide(details);
}, { urls: ["<all_urls>"] });

browser.proxy.onError.addListener((e) => console.warn("lodica proxy error", e && e.message));

// Lite mode: sites the user marked lite load without images, media, fonts or external scripts.
const HEAVY = new Set(["image", "imageset", "media", "font", "script", "object"]);
let saved = {};
let flush = null;
let native = null;

function hostOf(raw) {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; }
}

function liteSite(details) {
  const doc = hostOf(details.documentUrl || details.originUrl || "");
  if (!doc) return "";
  return cfg.lite.some((d) => doc === d || doc.endsWith("." + d)) ? doc : "";
}

browser.webRequest.onBeforeRequest.addListener((details) => {
  if (!cfg.lite.length || !HEAVY.has(details.type)) return {};
  const site = liteSite(details);
  if (!site) return {};
  saved[site] = (saved[site] || 0) + 1;
  if (!flush) flush = setTimeout(() => {
    flush = null;
    if (native) for (const host in saved) native.postMessage({ type: "saved", host, count: saved[host] });
    saved = {};
  }, 3000);
  return { cancel: true };
}, { urls: ["<all_urls>"] }, ["blocking"]);

// YouTube ads: the player response carries the ad plan. Renaming its keys in the watch page and in the
// player and next API answers leaves the player with nothing to schedule. The names keep their length class.
const YT_RENAME = [[/"adPlacements"/g, '"noAdPlacements"'], [/"playerAds"/g, '"noPlayerAds"'], [/"adSlots"/g, '"noAdSlots"']];

function stripYoutubeAds(details) {
  if (details.type !== "main_frame" && details.type !== "xmlhttprequest") return {};
  let filter;
  try { filter = browser.webRequest.filterResponseData(details.requestId); } catch (e) { return {}; }
  const dec = new TextDecoder("utf-8");
  const enc = new TextEncoder();
  let text = "";
  filter.ondata = (ev) => { text += dec.decode(ev.data, { stream: true }); };
  filter.onstop = () => {
    text += dec.decode();
    for (const [re, to] of YT_RENAME) text = text.replace(re, to);
    filter.write(enc.encode(text));
    filter.close();
  };
  filter.onerror = () => { try { filter.disconnect(); } catch (e) { /* closed */ } };
  return {};
}

browser.webRequest.onBeforeRequest.addListener(stripYoutubeAds, {
  urls: [
    "*://www.youtube.com/watch*", "*://m.youtube.com/watch*", "*://www.youtube.com/",
    "*://www.youtube.com/youtubei/v1/player*", "*://www.youtube.com/youtubei/v1/next*",
    "*://m.youtube.com/youtubei/v1/player*", "*://m.youtube.com/youtubei/v1/next*",
  ],
}, ["blocking"]);

// Lodica Search (search.html): results come from the VPS search API, the AI box is answered by the app
// through the local Claude Code bridge, so questions and answers never reach the VPS.
const asks = new Map();
let askId = 0;

browser.runtime.onMessage.addListener(async (msg) => {
  if (!msg) return undefined;
  if (msg.type === "state") {
    await configured;
    return { api: !!cfg.api, ai: cfg.ai && !!native, theme: cfg.theme };
  }
  if (msg.type === "search") {
    await configured;
    if (!cfg.api) return { error: "Lodica Search is not available in this build." };
    const qs = new URLSearchParams({ q: String(msg.q || ""), p: String(msg.p || 1) });
    if (msg.c) qs.set("c", String(msg.c));
    if (msg.l) qs.set("l", String(msg.l));
    try {
      const r = await fetch("https://lodica." + domain + "/api/search?" + qs, { headers: { Authorization: "Bearer " + cfg.api }, credentials: "omit" });
      if (!r.ok) return { error: "Search failed (" + r.status + ")" };
      return await r.json();
    } catch (e) {
      return { error: "Search server unreachable" };
    }
  }
  if (msg.type === "ask") {
    if (!native || !cfg.ai) return { error: "AI is not connected" };
    const id = ++askId;
    return new Promise((resolve) => {
      asks.set(id, resolve);
      setTimeout(() => { if (asks.delete(id)) resolve({ error: "AI took too long" }); }, 90000);
      native.postMessage({ type: "ask", id, q: String(msg.q || "").slice(0, 1000), ctx: String(msg.ctx || "").slice(0, 600), history: Array.isArray(msg.history) ? msg.history.slice(-10) : [] });
    });
  }
  if (msg.type === "suggest" || msg.type === "top") {
    if (!native) return [];
    const id = ++askId;
    return new Promise((resolve) => {
      asks.set(id, resolve);
      setTimeout(() => { if (asks.delete(id)) resolve([]); }, 3000);
      native.postMessage({ type: msg.type, id, q: String(msg.q || "").slice(0, 200) });
    });
  }
  if (msg.type === "icon") return icon(msg.h);
  return undefined;
});

// Site icons for the result circles. Fetched from the site itself (no third-party icon service), cached in memory.
const icons = new Map();
function icon(host) {
  host = String(host || "").toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return Promise.resolve({ url: null });
  if (!icons.has(host)) icons.set(host, fetchIcon(host));
  return icons.get(host).then((url) => ({ url }));
}
async function fetchIcon(host) {
  try {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 4000);
    const r = await fetch("https://" + host + "/favicon.ico", { signal: ctl.signal, redirect: "follow", credentials: "omit" });
    const type = (r.headers.get("content-type") || "").split(";")[0];
    if (!r.ok || !/^image\/(x-icon|vnd\.microsoft\.icon|png|svg\+xml|webp|gif|jpeg)$/.test(type)) return null;
    const blob = await r.blob();
    if (!blob.size || blob.size > 200000) return null;
    return await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(null); f.readAsDataURL(new Blob([blob], { type })); });
  } catch (e) { return null; }
}

function connect() {
  const port = browser.runtime.connectNative("lodica");
  port.onMessage.addListener((msg) => {
    if (msg && msg.type === "config") {
      if (/^[a-z0-9.-]+$/i.test(String(msg.domain || ""))) domain = String(msg.domain).toLowerCase();
      dns = Array.isArray(msg.dns) ? msg.dns.filter((p) => Array.isArray(p) && p.length === 2).map((p) => [String(p[0]).toLowerCase(), String(p[1])]) : [];
      cfg = {
        enabled: !!msg.enabled,
        auth: String(msg.auth || ""),
        direct: Array.isArray(msg.direct) ? msg.direct.map(String) : [],
        lite: Array.isArray(msg.lite) ? msg.lite.map(String) : [],
        api: String(msg.api || ""),
        ai: !!msg.ai,
        theme: msg.theme && typeof msg.theme === "object" ? msg.theme : null,
      };
      // Content scripts in every frame read page options from storage; the native port only reaches the app.
      browser.storage.local.set({ page: Object.assign({}, msg.page || {}, { lite: cfg.lite }), domain });
      ready();
    } else if (msg && msg.type === "answer") {
      const done = asks.get(msg.id);
      if (done) { asks.delete(msg.id); done(msg); }
    } else if (msg && msg.type === "reply") {
      const done = asks.get(msg.id);
      if (done) { asks.delete(msg.id); done(Array.isArray(msg.items) ? msg.items : []); }
    }
  });
  native = port;
  port.onDisconnect.addListener(() => { native = null; setTimeout(connect, 1000); });
}
connect();
