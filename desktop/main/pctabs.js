// "Tabs on PC" sync: encrypted tab lists exchanged through the relay under one shared secret.
// The secret holds a 16-byte id seed and a 32-byte AES key. The device that created it (owner) writes the
// base id and reads the derived id; a device that adopted a link (peer) does the opposite. The link shown on
// every device is the base-id viewer link, so it doubles as the pairing code.
const crypto = require("crypto");
const store = require("./store");
const prefs = require("./prefs");
const relay = require("./relay");
const history = require("./history");
const linkdata = require("./linkdata");
const linkkey = require("./linkkey");

const MAX = 512 * 1024;
const POLL_MS = 30 * 1000;
const KEEPALIVE_MS = 12 * 3600 * 1000;
const LINK = /([A-Za-z0-9_-]{22})#([A-Za-z0-9_-]{43})/;

let tabs = null, ai = null, ui = null, timer = null, poll = null, keepalive = null;
let state = null;
let remote = { tabs: [], updated: 0 };

function load() {
  if (state) return state;
  const s = store.loadSecret("pctabs", null);
  let secret = null, owner = true;
  if (s && typeof s === "object") { secret = Buffer.from(String(s.secret), "hex"); owner = s.owner !== false; }
  else if (typeof s === "string") secret = Buffer.from(s, "hex");
  if (!secret || secret.length !== 48) { secret = crypto.randomBytes(48); owner = true; }
  state = { secret, owner };
  save();
  return state;
}

const save = () => store.saveSecret("pctabs", { secret: state.secret.toString("hex"), owner: state.owner });

function ids(secret) {
  const key = secret.subarray(16);
  const base = secret.subarray(0, 16).toString("base64url");
  const derived = crypto.createHmac("sha256", key).update("pc").digest().subarray(0, 16).toString("base64url");
  return { base, derived, key };
}

function sides() {
  const { secret, owner } = load();
  const { base, derived, key } = ids(secret);
  return { key, base, write: owner ? base : derived, read: owner ? derived : base };
}

const enabled = () => !!prefs.p.pcTabs && relay.available;
// What this device sends and accepts (Settings > Linked devices).
const sel = (id) => !!(prefs.p.linkShare && prefs.p.linkShare[id]);

// Wi-Fi and Bluetooth take seconds to read, so they are read at most every ten minutes.
let slow = { at: 0, wifi: [], bluetooth: [] };
async function slowData() {
  if (Date.now() - slow.at < 10 * 60e3) return slow;
  slow = { at: Date.now(), wifi: sel("wifi") ? await linkdata.wifiCollect() : [], bluetooth: sel("bluetooth") ? await linkdata.bluetoothCollect() : [] };
  return slow;
}

// The chosen categories beyond tabs, history and chats. Passwords, authenticator keys and Wi-Fi go sealed under the link key.
async function collectPlain() {
  const d = {}, secret = {};
  if (sel("chatName")) { try { d.chatName = String(require("./room").state.name || ""); } catch { /* no chat */ } }
  if (sel("shortcuts")) d.shortcuts = prefs.p.quickSites;
  if (sel("settings")) { d.settings = linkdata.pickSettings(prefs.p, prefs.p); d.settingsAt = linkAt("settings"); }
  if (sel("sites")) { d.sites = {}; for (const k of linkdata.LISTS) d.sites[k] = prefs.p[k]; d.hidden = prefs.p.quickHidden; }
  const s = (sel("wifi") || sel("bluetooth")) ? await slowData() : null;
  if (sel("bluetooth")) d.bluetooth = s.bluetooth;
  if (sel("passwords")) secret.passwords = require("./vault").exportAll();
  if (sel("totp")) secret.totp = require("./totp").exportAll();
  if (sel("wifi")) secret.wifi = s.wifi;
  return { d, secret };
}
async function collectData() {
  const { d, secret } = await collectPlain();
  if (Object.keys(secret).length && linkkey.hasKey()) d.sealed = linkkey.sealData(secret);
  return d;
}
// Did anything this device would send change? Checked with every poll, so edits to passwords, keys, settings and lists go out
// without needing a trigger of their own.
let lastOut = "";
async function outChanged() {
  const f = fingerprint(await collectPlain());
  const changed = f !== lastOut;
  lastOut = f;
  return changed;
}

// What the other device sent. A category is only taken in when this device has it switched on.
// When this device last changed its settings itself. Settings are one block, so the newest block wins: a device only takes the other
// device's settings when they were changed after its own, and taking them in does not count as a change of its own.
let applying = false;
const linkAt = (k, v) => {
  const store = require("./store"), s = store.load("linkat", {});
  if (v === undefined) return Number(s[k]) || 0;
  s[k] = v; store.save("linkat", () => s);
  return v;
};
const seen = () => require("./store").load("linkseen", {});
const markSeen = (k, v) => { const s = seen(); s[k] = v; require("./store").save("linkseen", () => s); };
const fingerprint = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

async function applyData(d) {
  const out = { keyMissing: false, applied: [] };
  if (!d || typeof d !== "object") return out;
  if (sel("chatName") && typeof d.chatName === "string" && d.chatName && markNew("chatName", d.chatName)) {
    try { const room = require("./room"); if (room.state.name !== d.chatName) await room.setName(d.chatName); out.applied.push("chatName"); } catch { /* chat not set up */ }
  }
  if (sel("shortcuts") && Array.isArray(d.shortcuts) && markNew("shortcuts", d.shortcuts)) {
    const r = linkdata.mergeShortcuts(prefs.p.quickSites, d.shortcuts);
    if (r.changed) { prefs.set("quickSites", r.list); out.applied.push("shortcuts"); }
  }
  if (sel("settings") && d.settings && typeof d.settings === "object" && Number(d.settingsAt) > linkAt("settings")) {
    const got = linkdata.pickSettings(d.settings, prefs.p);
    applying = true;
    try { for (const k of Object.keys(got)) prefs.set(k, got[k]); } finally { applying = false; }
    linkAt("settings", Number(d.settingsAt));
    out.applied.push("settings");
  }
  if (sel("sites") && d.sites && typeof d.sites === "object" && markNew("sites", d.sites)) {
    for (const k of linkdata.LISTS) { const r = linkdata.union(prefs.p[k], d.sites[k]); if (r.changed) prefs.set(k, r.list); }
    if (Array.isArray(d.hidden)) { const r = linkdata.union(prefs.p.quickHidden, d.hidden); if (r.changed) prefs.set("quickHidden", r.list); }
    out.applied.push("sites");
  }
  if (typeof d.sealed === "string" && (sel("passwords") || sel("totp") || sel("wifi"))) {
    const secret = linkkey.openData(d.sealed);
    if (!secret) out.keyMissing = true;
    else if (markNew("sealed", d.sealed)) {
      if (sel("passwords") && Array.isArray(secret.passwords) && require("./vault").importMany(secret.passwords)) out.applied.push("passwords");
      if (sel("totp") && Array.isArray(secret.totp) && require("./totp").importMany(secret.totp)) out.applied.push("totp");
      if (sel("wifi") && Array.isArray(secret.wifi) && (await linkdata.wifiApply(secret.wifi))) out.applied.push("wifi");
    }
  }
  return out;
}
// True when this is a different copy than the last one taken in, so a device that has since changed its own value is not overwritten again and again.
function markNew(k, v) { const f = fingerprint(v); if (seen()[k] === f) return false; markSeen(k, f); return true; }
const auth = () => ({ Authorization: "Bearer " + relay.token });

async function payload() {
  const list = !sel("tabs") ? [] : tabs.all().filter(t => !t.private && !t.archived && /^https?:/.test(t.url))
    .map(t => ({ title: t.title || t.url, url: t.url, private: false }));
  // Chats ride along in the same encrypted blob; they are the first thing dropped when it gets too big.
  let chats = ai ? ai.chats.raw() : [];
  let hist = sel("history") ? history.recent(300) : undefined;
  const data = await collectData();
  const build = () => JSON.stringify({ updated: Date.now(), tabs: list, chats, history: hist, data });
  let out = build();
  while (Buffer.byteLength(out) > MAX - 1024 && (chats.length || hist?.length || data.bluetooth)) {
    if (data.bluetooth) delete data.bluetooth;
    else if (hist?.length) hist = hist.slice(0, Math.floor(hist.length / 2));
    else chats = chats.slice().sort((a, b) => b.updated - a.updated).slice(0, Math.floor(chats.length / 2));
    out = build();
  }
  return out;
}

function encrypt(text, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

function decrypt(buf, key) {
  if (buf.length < 29) throw new Error("short");
  const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString("utf8");
}

async function upload() {
  if (!enabled() || !tabs) return;
  const { write, key } = sides();
  const body = encrypt(await payload(), key);
  if (body.length > MAX) return;
  try {
    await fetch(`${relay.API}/api/tabs/${write}`, {
      method: "PUT", body,
      headers: { ...auth(), "Content-Type": "application/octet-stream" },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) { console.error("pctabs upload failed:", e.message); }
}

function schedule() {
  if (!enabled()) return;
  clearTimeout(timer);
  timer = setTimeout(upload, 3000);
}

const drop = id => fetch(`${relay.API}/api/tabs/${id}`, {
  method: "DELETE", headers: auth(), signal: AbortSignal.timeout(15000),
}).catch(() => {});

// Fetch and decrypt the other device's list. A missing blob means the other side has not uploaded (or was reset).
async function fetchRemote() {
  if (!enabled()) return remote;
  const { read, key } = sides();
  let next = { tabs: [], updated: 0 };
  try {
    const r = await fetch(`${relay.API}/api/tabs/${read}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (r.ok) {
      const j = JSON.parse(decrypt(Buffer.from(await r.arrayBuffer()), key));
      if (ai && Array.isArray(j.chats)) ai.chats.merge(j.chats);
      if (sel("history") && Array.isArray(j.history)) history.merge(j.history);
      const applied = await applyData(j.data);
      const list = Array.isArray(j.tabs) ? j.tabs : [];
      next = {
        updated: Number(j.updated) || 0,
        tabs: list.filter(t => t && /^https?:\/\//i.test(String(t.url))).slice(0, 200)
          .map(t => ({ title: String(t.title || t.url).slice(0, 300), url: String(t.url) })),
        bluetooth: sel("bluetooth") && j.data && Array.isArray(j.data.bluetooth) ? j.data.bluetooth.slice(0, 50).map(s => String(s).slice(0, 80)) : [],
        keyMissing: applied.keyMissing,
      };
    } else if (r.status !== 404) return remote;
  } catch (e) { console.error("pctabs fetch failed:", e.message); return remote; }
  if (JSON.stringify(next) !== JSON.stringify(remote)) {
    remote = next;
    ui?.push("pctabs.remote", remote);
  }
  return remote;
}

const viewLink = () => { const { base, key } = sides(); return `${relay.API}/t/${base}#${key.toString("base64url")}`; };

function link() {
  if (!enabled()) return null;
  schedule();
  return viewLink();
}

// Adopt the link or code shown on another device. This device becomes a peer of that secret.
async function pair(text) {
  const m = LINK.exec(String(text || "").trim());
  if (!m || !relay.available) return false;
  const id = Buffer.from(m[1], "base64url"), key = Buffer.from(m[2], "base64url");
  if (id.length !== 16 || key.length !== 32) return false;
  drop(sides().write);
  state = { secret: Buffer.concat([id, key]), owner: false };
  save();
  remote = { tabs: [], updated: 0 };
  ui?.push("pctabs.remote", remote);
  if (enabled()) { await upload(); await fetchRemote(); }
  return true;
}

async function reset() {
  if (!relay.available) return null;
  const { secret } = load();
  const old = ids(secret);
  drop(old.base);
  drop(old.derived);
  state = { secret: crypto.randomBytes(48), owner: true };
  save();
  remote = { tabs: [], updated: 0 };
  ui?.push("pctabs.remote", remote);
  if (enabled()) await upload();
  return viewLink();
}

// Pairing by short code: one device shows a code, the other types it. Both are on the same relay token.
async function pairCode() {
  if (!relay.available) return null;
  const r = await fetch(`${relay.API}/api/pair`, {
    method: "POST", headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ link: viewLink() }), signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  return (await r.json()).code || null;
}

async function pairWithCode(code) {
  const c = String(code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (c.length !== 6 || !relay.available) return false;
  const r = await fetch(`${relay.API}/api/pair/${c}`, { headers: auth(), signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r || !r.ok) return false;
  const j = await r.json().catch(() => null);
  if (!j || typeof j.link !== "string") return false;
  if (!prefs.p.pcTabs) prefs.set("pcTabs", true);
  return pair(j.link);
}

// Phone control: commands for the linked phone ride in their own encrypted blob that only this side writes.
let cmds = [];
const cmdId = () => { const { key } = sides(); return crypto.createHmac("sha256", key).update("cmd").digest().subarray(0, 16).toString("base64url"); };

async function control(cmd) {
  if (!enabled() || !cmd || typeof cmd !== "object") return false;
  const type = String(cmd.type);
  if (!["open", "close", "focus", "reload"].includes(type)) return false;
  const url = String(cmd.url || "");
  if (type !== "reload" && !/^https?:\/\//i.test(url)) return false;
  const now = Date.now();
  cmds = cmds.filter(c => now - c.at < 10 * 60e3).slice(-19);
  cmds.push({ at: now, type, url: url.slice(0, 2000) });
  try {
    const r = await fetch(`${relay.API}/api/tabs/${cmdId()}`, {
      method: "PUT", body: encrypt(JSON.stringify({ cmds }), sides().key),
      headers: { ...auth(), "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(15000),
    });
    return r.ok;
  } catch { return false; }
}

// ---- Moving the link key to a new device (linkkey.js) ----
// Two small encrypted messages ride on the link: "kq" (new device to the device that made the key file) and "ka" (the answer).
// While an exchange is open both sides look every 2 seconds, for at most 5 minutes.
const chanId = (name) => crypto.createHmac("sha256", sides().key).update("ch:" + name).digest().subarray(0, 16).toString("base64url");
async function put(name, obj) {
  try {
    const r = await fetch(`${relay.API}/api/tabs/${chanId(name)}`, { method: "PUT", body: encrypt(JSON.stringify(obj), sides().key), headers: { ...auth(), "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(15000) });
    return r.ok;
  } catch { return false; }
}
async function get(name) {
  try {
    const r = await fetch(`${relay.API}/api/tabs/${chanId(name)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    return r.ok ? JSON.parse(decrypt(Buffer.from(await r.arrayBuffer()), sides().key)) : null;
  } catch { return null; }
}
let ex = null, fast = null, exBusy = false;
const note = (o) => ui?.push("link.key", o);
function stopFast() { clearInterval(fast); fast = null; ex = null; }
function startFast(role, extra) { stopFast(); ex = { role, until: Date.now() + 5 * 60e3, lastT: 0, ...extra }; fast = setInterval(exTick, 2000); }

async function exTick() {
  if (!ex) return;
  if (Date.now() > ex.until) { note({ step: "expired" }); return stopFast(); }
  if (exBusy) return;
  exBusy = true;
  try {
    const { key } = sides();
    if (ex.role === "origin") {
      const m = await get("kq");
      if (!m || !m.session || m.t === ex.lastT) return;
      ex.lastT = m.t;
      if (m.type === "req") {
        const code = linkkey.request(String(m.session), String(m.id));
        if (!code) { await put("ka", { session: m.session, type: "unknown", t: Date.now() }); note({ step: "unknown" }); return; }
        await put("ka", { session: m.session, type: "code", t: Date.now() });
        note({ step: "code", code, seconds: Math.round(linkkey.CODE_MS / 1000) });
      } else if (m.type === "proof") {
        const r = linkkey.answer(String(m.session), String(m.proof), key);
        await put("ka", r.wrap ? { session: m.session, type: "ok", wrap: r.wrap, t: Date.now() } : { session: m.session, type: "bad", error: r.error, t: Date.now() });
        if (r.wrap) { note({ step: "sent" }); stopFast(); } else note({ step: "bad", error: r.error });
      }
    } else {
      const m = await get("ka");
      if (!m || m.session !== ex.session || m.t === ex.lastT) return;
      ex.lastT = m.t;
      if (m.type === "code") note({ step: "enter" });
      else if (m.type === "unknown") { note({ step: "unknown" }); stopFast(); }
      else if (m.type === "bad") note({ step: "bad", error: m.error });
      else if (m.type === "ok" && ex.code) {
        const w = linkkey.unwrapAnswer(m.wrap, key, ex.session, ex.code);
        if (w && linkkey.adopt(ex.file, w)) { note({ step: "done" }); stopFast(); slow.at = 0; schedule(); fetchRemote(); }
        else note({ step: "bad", error: "wrong code" });
      }
    }
  } finally { exBusy = false; }
}

/** A key file for this device's link key. With [cable] the file carries its own file key; otherwise this device waits to show a code. */
function makeKeyFile(cable) {
  const file = linkkey.makeFile(!!cable);
  if (!cable && enabled()) startFast("origin", {});
  return file;
}
/** Insert a key file. A cable file goes in at once; the other kind asks the device that made it, which shows a code. */
async function insertKeyFile(text) {
  const f = linkkey.readFile(text);
  if (!f) return { error: "That is not a key file" };
  if (f.w) return linkkey.adopt(f, f.w) ? (slow.at = 0, schedule(), { ok: true }) : { error: "The key file is damaged" };
  if (!enabled()) return { error: "Link the device that made this file first" };
  const session = crypto.randomBytes(8).toString("hex");
  if (!(await put("kq", { session, type: "req", id: f.id, t: Date.now() }))) return { error: "Could not reach the server" };
  startFast("new", { session, file: f, code: "" });
  return { step: "wait" };
}
/** The code typed on the new device. */
async function enterKeyCode(code) {
  const c = String(code || "").replace(/[^0-9]/g, "");
  if (!ex || ex.role !== "new" || c.length !== 6) return false;
  ex.code = c;
  return put("kq", { session: ex.session, type: "proof", proof: linkkey.proofOf(sides().key, ex.session, c), t: Date.now() });
}
const keyStatus = () => linkkey.status();
function createKey() { return linkkey.create(); }
function forgetKey() { stopFast(); linkkey.forget(); }

const status = () => ({ owner: load().owner, ...remote });

function init(deps) {
  tabs = deps.tabs;
  ai = deps.ai;
  ui = deps.ui;
  if (ai) ai.chats.onChange(() => { schedule(); ui?.push("ai.chats", ai.chats.get()); });
  // Before 1.14.4 history sharing was its own switch.
  if (prefs.p.shareHistory) { prefs.set("linkShare", { ...prefs.p.linkShare, history: true }); prefs.set("shareHistory", false); }
  prefs.events.on("change", k => {
    if (!applying && linkdata.SETTINGS.includes(k)) linkAt("settings", Date.now());
    if ((k === "pcTabs" || k === "linkShare") && prefs.p.pcTabs) { slow.at = 0; schedule(); fetchRemote(); }
  });
  schedule();
  fetchRemote();
  poll = setInterval(async () => { if (enabled() && await outChanged()) upload(); fetchRemote(); }, POLL_MS);
  keepalive = setInterval(() => { upload(); }, KEEPALIVE_MS);
  poll.unref();
  keepalive.unref();
}

module.exports = { init, schedule, link, reset, pair, pairCode, pairWithCode, control, status, refresh: fetchRemote, makeKeyFile, insertKeyFile, enterKeyCode, keyStatus, createKey, forgetKey };
