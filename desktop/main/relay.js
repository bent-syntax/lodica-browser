// Hidden-email relay and VPS routing, mirrored from the Android Relay object.
const { EventEmitter } = require("events");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const prefs = require("./prefs");

let config = {};
try { config = require(path.join(__dirname, "..", "config.json")); } catch { config = {}; }

// Port 443 first (passes restrictive networks, relay installs from v1.6); 44741/44742 are the older direct ports.
const PORT_API = 44741;
// A link made in Settings (domain + token, stored encrypted) wins over the build-time config.json.
const linked = store.loadSecret("relayLink", null);
let API = "", DOMAIN = "", TOKEN = "", available = false, proxyAuth = "";
let tunnelPort = 443;
function configure(c) {
  DOMAIN = (c && c.domain) || "";
  API = (c && c.api) || "";
  tunnelPort = /:44741$/.test(API) ? 44742 : 443;
  TOKEN = (c && c.token) || "";
  available = TOKEN.length > 0 && API.length > 0;
  proxyAuth = available ? "Basic " + Buffer.from("lodica:" + TOKEN).toString("base64") : "";
}
configure(linked && linked.domain ? { domain: linked.domain, token: linked.token, api: linked.api || `https://lodica.${linked.domain}` } : config);
const POLL = 5000;
const WATCH = 5 * 60 * 1000;


const events = new EventEmitter();
const state = { aliases: store.load("aliases", []), mails: [], incoming: null, loading: false, error: null };
const watches = new Map();
let onCode = null;
// Forgotten addresses whose removal still has to reach the relay.
let removed = store.load("aliasRemoved", []);

function persist() { store.save("aliases", () => state.aliases); }
function changed() { events.emit("change"); }
const local = a => a.address.split("@")[0];

async function request(method, url, timeout = 15000, json) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const headers = { Authorization: "Bearer " + TOKEN };
    if (json !== undefined) headers["Content-Type"] = "application/json";
    const r = await fetch(API + url, { method, headers, body: json === undefined ? undefined : JSON.stringify(json), signal: ctl.signal });
    return [r.status, await r.text()];
  } finally { clearTimeout(t); }
}

/** Raw upload or download against the relay. [onProgress] gets the fraction of the body sent. Resolves to [status, Buffer]. */
async function requestRaw(method, url, timeout = 60000, body, onProgress) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const headers = { Authorization: "Bearer " + TOKEN };
    let payload;
    if (body) {
      headers["Content-Type"] = "application/octet-stream";
      headers["Content-Length"] = String(body.length);
      let sent = 0;
      payload = new ReadableStream({
        pull(c) {
          if (sent >= body.length) return c.close();
          const end = Math.min(body.length, sent + 64 * 1024);
          c.enqueue(body.subarray(sent, end)); sent = end;
          if (onProgress) onProgress(sent / body.length);
        },
      });
    }
    const r = await fetch(API + url, { method, headers, body: payload, duplex: payload ? "half" : undefined, signal: ctl.signal });
    return [r.status, Buffer.from(await r.arrayBuffer())];
  } finally { clearTimeout(t); }
}

async function fetchMail(alias, since) {
  const q = new URLSearchParams();
  if (alias) q.set("alias", alias);
  if (since) q.set("since", String(since));
  const [status, body] = await request("GET", "/api/mail" + (q.toString() ? "?" + q : ""));
  if (status !== 200) throw new Error("HTTP " + status);
  return JSON.parse(body).map(m => Object.assign({ alias: "", to: "", from: "", subject: "", date: "", text: "", html: null, links: [] }, m));
}

/** Address list is kept per account on the relay, so every browser shows every hidden address. */
async function syncAliases() {
  try {
    const [status, body] = await request("GET", "/api/aliases");
    if (status !== 200) return;
    const remote = JSON.parse(body);
    const known = new Set(state.aliases.map(a => a.address.toLowerCase()));
    const gone = new Set(removed.map(a => a.toLowerCase()));
    let added = false;
    for (const a of remote) {
      if (!a || !a.address || known.has(a.address.toLowerCase()) || gone.has(a.address.toLowerCase())) continue;
      state.aliases.push({ address: a.address, site: a.site || "", created: a.created || Date.now() });
      added = true;
    }
    if (added) { state.aliases.sort((x, y) => y.created - x.created); persist(); }
    const remoteSet = new Set(remote.map(a => a.address.toLowerCase()));
    const missing = state.aliases.filter(a => !remoteSet.has(a.address.toLowerCase()));
    if (missing.length) await request("POST", "/api/aliases", 15000, missing);
    for (const a of removed.slice()) {
      const [st] = await request("DELETE", "/api/aliases/" + encodeURIComponent(a.split("@")[0]));
      if (st === 204 || st === 404) removed = removed.filter(x => x !== a);
    }
    store.save("aliasRemoved", () => removed);
  } catch { /* offline: local list still works */ }
}

/** The custom theme is one record per account, newest write wins. Returns the remote theme when it is newer than `local`. */
async function syncTheme(local) {
  if (!available) return null;
  try {
    const [status, body] = await request("GET", "/api/theme");
    if (status !== 200) return null;
    const remote = JSON.parse(body);
    const mine = local && local.at || 0;
    if (remote && remote.at > mine) return remote;
    if (local && mine > (remote && remote.at || 0)) await request("PUT", "/api/theme", 15000, local);
  } catch { /* offline: local theme still works */ }
  return null;
}

let onRefresh = null;

async function refresh() {
  if (!available || state.loading) return;
  state.loading = true; state.error = null; changed();
  await syncAliases();
  if (onRefresh) await onRefresh();
  try { state.mails = await fetchMail(); } catch { state.error = "Couldn't reach the relay"; }
  state.loading = false; changed();
}

async function deleteMail(id) {
  try {
    const [status] = await request("DELETE", "/api/mail/" + encodeURIComponent(id));
    const ok = status >= 200 && status < 300;
    if (ok) {
      state.mails = state.mails.filter(m => m.id !== id);
      if (state.incoming && state.incoming.id === id) state.incoming = null;
      changed();
    }
    return ok;
  } catch { return false; }
}

function forget(address) {
  state.aliases = state.aliases.filter(a => a.address !== address);
  if (available) { removed.push(address); store.save("aliasRemoved", () => removed); syncAliases(); }
  const w = watches.get(address); if (w) { w.stop = true; watches.delete(address); }
  persist(); changed();
}

function siteOf(address) {
  const a = state.aliases.find(x => x.address.toLowerCase() === (address || "").toLowerCase());
  return a ? a.site : null;
}

function newAlias(host) {
  const base = (host || "").toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const labels = base.split(".");
  const name = labels.length > 1 ? labels[labels.length - 2] : labels[0];
  const slug = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let tail = ""; for (let i = 0; i < 6; i++) tail += chars[crypto.randomInt(chars.length)];
  const alias = { address: `${slug}-${tail}@${DOMAIN}`, site: base, created: Date.now() };
  state.aliases.unshift(alias);
  persist(); changed();
  if (available) request("POST", "/api/aliases", 15000, alias).catch(() => {});
  return alias;
}

/** Polls the relay for 5 minutes after a sign-up so the confirmation mail shows up fast. */
function watch(alias) {
  const old = watches.get(alias.address); if (old) old.stop = true;
  const w = { stop: false };
  watches.set(alias.address, w);
  const since = alias.created - 60000;
  const end = Date.now() + WATCH;
  (async () => {
    while (!w.stop && Date.now() < end) {
      await new Promise(r => setTimeout(r, POLL));
      if (w.stop) break;
      try {
        const list = await fetchMail(local(alias), since);
        if (list.length) { arrived(alias, list[0]); break; }
      } catch { /* keep polling */ }
    }
    if (watches.get(alias.address) === w) watches.delete(alias.address);
  })();
}

function arrived(alias, m) {
  if (!state.mails.some(x => x.id === m.id)) state.mails.unshift(m);
  state.incoming = m;
  changed();
  events.emit("mail", alias, m);
  const code = codeOf(m);
  if (code && onCode) onCode(alias, code);
}

function dismissIncoming() { state.incoming = null; changed(); }

const PAIRS = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "ne", "or"]);
function baseDomain(host) {
  const h = (host || "").toLowerCase();
  const parts = h.split(".");
  if (parts.length <= 2 || h.includes(":") || /^[\d.]+$/.test(h)) return h;
  const tld = parts[parts.length - 1];
  const n = tld.length === 2 && PAIRS.has(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-n).join(".");
}

const NUM = /(?<![\d.,:/-])(\d{3}[ -]?\d{3}|\d{4,8})(?![\d.,:/%-])/g;
const KEY = /code|otp|verif|pin|one.time/gi;
const nums = s => [...(s || "").matchAll(NUM)].map(x => x[1].replace(/[ -]/g, ""));

/** Finds a verification code in a mail: subject first, then near a keyword in the body. */
function codeOf(m) {
  const subj = nums(m.subject);
  const six = subj.find(n => n.length === 6);
  if (six) return six;
  if (/code|otp|verif|pin|one.time/i.test(m.subject || "")) {
    const any = subj.find(n => n.length >= 4 && n.length <= 8);
    if (any) return any;
  }
  const raw = (m.text || "").trim() ? m.text : (m.html || "").replace(/<[^>]*>/g, " ");
  const body = raw.replace(/\s+/g, " ");
  for (const k of body.matchAll(KEY)) {
    const after = body.slice(k.index + k[0].length, k.index + k[0].length + 160);
    const hit = nums(after).find(n => n.length >= 4 && n.length <= 8);
    if (hit) return hit;
  }
  return nums(body).find(n => n.length === 6) || null;
}

function confirmLink(m) {
  const links = (m.links || []).filter(l => /^https?:\/\//i.test(l));
  return links.find(l => /confirm|verif|activat|token/i.test(l)) || links.find(l => !/unsubscribe|privacy|terms|help/i.test(l)) || null;
}

const DIRECT_HOSTS = [
  "accounts.google.com", "accounts.youtube.com", "myaccount.google.com", "login.microsoftonline.com", "login.live.com",
  "login.microsoft.com", "appleid.apple.com", "idmsa.apple.com", "id.apple.com", "auth0.com", "okta.com", "onelogin.com",
  "paypal.com", "stripe.com", "pay.google.com", "itsme.be", "itsme-id.com",
];
const SENSITIVE = /(log-?in|sign-?in|sign-?on|oauth|sso|checkout|bank)|(^|[^a-z])(auth|account|pay)/i;
const PRIVATE_IP = /^(10|127|0)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./;
const under = (h, d) => h === d || h.endsWith("." + d);

function directHost(h) {
  if (!h || h === "localhost" || h.endsWith(".local") || under(h, DOMAIN)) return true;
  if (PRIVATE_IP.test(h) || h.startsWith("[") || h.includes(":")) return true;
  if (DIRECT_HOSTS.some(d => under(h, d)) || prefs.p.direct.some(d => under(h, d))) return true;
  return SENSITIVE.test(h);
}

/** True when this URL goes through the VPS tunnel. Logins, payments and local hosts stay direct. */
function routed(url) {
  if (!available || !prefs.p.routeVps) return false;
  let u; try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  return !directHost(h) && !SENSITIVE.test(u.pathname);
}

/** PAC script: https paths are hidden from PAC, so only host rules apply here. */
function pacScript() {
  const list = JSON.stringify(DIRECT_HOSTS.concat(prefs.p.direct));
  return `function FindProxyForURL(url, host) {
  host = host.toLowerCase();
  var d = ${list};
  function under(h, x) { return h === x || h.substring(h.length - x.length - 1) === "." + x; }
  if (url.substring(0, 5) !== "http:" && url.substring(0, 6) !== "https:") return "DIRECT";
  if (host === "localhost" || under(host, "local") || under(host, "${DOMAIN}")) return "DIRECT";
  if (${PRIVATE_IP}.test(host) || host.charAt(0) === "[" || host.indexOf(":") >= 0) return "DIRECT";
  for (var i = 0; i < d.length; i++) if (under(host, d[i])) return "DIRECT";
  if (${SENSITIVE}.test(host)) return "DIRECT";
  if (url.substring(0, 5) === "http:" && ${SENSITIVE}.test(url.replace(/^http:\\/\\/[^\\/]*/, ""))) return "DIRECT";
  return "HTTPS tunnel.${DOMAIN}:${tunnelPort}";
}`;
}

const cleanDomain = d => String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^(lodica|tunnel)\./, "").replace(/[/:].*$/, "");

/** Checks the domain and token against the relay, then saves the link and switches to it. */
async function link(domain, token) {
  domain = cleanDomain(domain); token = String(token || "").trim();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain)) return { ok: false, error: "Enter the domain you gave the installer, like example.com" };
  if (!token) return { ok: false, error: "Enter the token from /etc/lodica-relay/token" };
  let api = "", fail = null;
  for (const cand of [`https://lodica.${domain}`, `https://lodica.${domain}:${PORT_API}`]) {
    try {
      const h = await fetch(cand + "/api/health", { signal: AbortSignal.timeout(10000) });
      if (!h.ok) { fail = "Server answered HTTP " + h.status; continue; }
      const a = await fetch(cand + "/api/aliases", { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(10000) });
      if (a.status === 401 || a.status === 403) return { ok: false, error: "Token rejected" };
      if (!/json/i.test(a.headers.get("content-type") || "")) { fail = "That address is not a Lodica relay"; continue; }
      api = cand; break;
    } catch (e) {
      const why = (e && e.cause && (e.cause.code || e.cause.message)) || (e && (e.name === "TimeoutError" ? "timed out" : e.message)) || "unknown error";
      fail = `Can't reach lodica.${domain} (${why}). Check DNS, then re-run the relay installer on the server so it serves port 443`;
    }
  }
  if (!api) return { ok: false, error: fail || "Can't reach the server" };
  if (!store.saveSecret("relayLink", { domain, token, api })) return { ok: false, error: "Can't store the token: no system keyring available" };
  configure({ domain, token, api });
  changed(); refresh();
  return { ok: true, domain };
}

function unlink() {
  try { require("fs").unlinkSync(require("path").join(require("electron").app.getPath("userData"), "relayLink.bin")); } catch {}
  configure(config);
  changed();
  return { ok: true };
}

module.exports = {
  get API() { return API; }, get DOMAIN() { return DOMAIN; }, get available() { return available; },
  get token() { return TOKEN; }, get proxyAuth() { return proxyAuth; },
  link, unlink, linked: () => ({ linked: !!(store.loadSecret("relayLink", null)), domain: DOMAIN }), state, events, request, requestRaw, fetchMail, refresh, deleteMail,
  forget, siteOf, newAlias, watch, arrived, dismissIncoming, baseDomain, codeOf, confirmLink, routed, pacScript,
  setOnCode: fn => { onCode = fn; }, setOnRefresh: fn => { onRefresh = fn; }, syncTheme, local,
};
