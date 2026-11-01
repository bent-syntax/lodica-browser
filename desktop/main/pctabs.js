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
const sel = (id) => linkdata.isShared(prefs.p.linkShare, id);

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
  if (sel("settings")) { d.settings = linkdata.pickSettings(prefs.p, prefs.p); if (!linkAt("settings")) linkAt("settings", 1); d.settingsAt = linkAt("settings"); }
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
  if (Object.keys(secret).length && linkkey.hasKey()) { d.sealed = linkkey.sealData(secret); d.sealedKey = linkkey.keyId(); }
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
  const out = { keyMissing: false, keyDiffers: false, otherKeyId: null, applied: [] };
  if (!d || typeof d !== "object") return out;
  if (sel("chatName") && typeof d.chatName === "string" && d.chatName && markNew("chatName", d.chatName)) {
    try { const room = require("./room"); if (room.state.name !== d.chatName) await room.setName(d.chatName); out.applied.push("chatName"); } catch { /* chat not set up */ }
  }
  if (sel("shortcuts") && Array.isArray(d.shortcuts) && markNew("shortcuts", d.shortcuts)) {
    const r = linkdata.mergeShortcuts(prefs.p.quickSites, d.shortcuts);
    if (r.changed) { prefs.set("quickSites", r.list); out.applied.push("shortcuts"); }
  }
  if (sel("settings") && d.settings && typeof d.settings === "object") {
    const from = linkdata.THEME_FROM.includes(prefs.p.themeFrom) ? prefs.p.themeFrom : "newest";
    const got = linkdata.pickSettings(d.settings, prefs.p), newer = Number(d.settingsAt) > linkAt("settings");
    const theme = {};
    for (const k of linkdata.THEME_KEYS) if (k in got) { theme[k] = got[k]; delete got[k]; }
    // The theme follows the choice. Everything else in the block follows the newest change.
    const take = Object.assign({}, newer ? got : {}, from === "other" ? (markNew("theme", theme) ? theme : {}) : from === "newest" && newer ? theme : {});
    if (Object.keys(take).length) {
      applying = true;
      try { for (const k of Object.keys(take)) if (JSON.stringify(prefs.p[k]) !== JSON.stringify(take[k])) prefs.set(k, take[k]); } finally { applying = false; }
      out.applied.push("settings");
    }
    if (newer) linkAt("settings", Number(d.settingsAt));
  }
  if (sel("sites") && d.sites && typeof d.sites === "object" && markNew("sites", d.sites)) {
    for (const k of linkdata.LISTS) { const r = linkdata.union(prefs.p[k], d.sites[k]); if (r.changed) prefs.set(k, r.list); }
    if (Array.isArray(d.hidden)) { const r = linkdata.union(prefs.p.quickHidden, d.hidden); if (r.changed) prefs.set("quickHidden", r.list); }
    out.applied.push("sites");
  }
  if (typeof d.sealed === "string") {
    const secret = linkkey.openData(d.sealed);
    if (!secret) {
      // Without a key we need one; with a key the two devices hold different keys.
      if (linkkey.hasKey()) { out.keyDiffers = true; out.otherKeyId = typeof d.sealedKey === "string" ? d.sealedKey.slice(0, 8) : null; }
      else out.keyMissing = true;
    }
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
  if (body.length > MAX) { setError("Too much to send: passwords and keys are over 512 KB"); return; }
  try {
    const r = await fetch(`${relay.API}/api/tabs/${write}`, {
      method: "PUT", body,
      headers: { ...auth(), "Content-Type": "application/octet-stream" },
      signal: AbortSignal.timeout(20000),
    });
    setError(r.ok ? null : "Sending failed (server answered " + r.status + ")");
  } catch (e) { console.error("pctabs upload failed:", e.message); setError("Sending failed: " + e.message); }
}
// The last upload problem, shown in Settings so a stop is never silent.
let lastError = null;
function setError(e) {
  if (e === lastError) return;
  lastError = e;
  if (e) console.error("pctabs:", e);
  ui?.push("pctabs.remote", status());
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
        keyDiffers: applied.keyDiffers,
        otherKeyId: applied.otherKeyId,
      };
    } else if (r.status !== 404) return remote;
  } catch (e) { console.error("pctabs fetch failed:", e.message); return remote; }
  if (JSON.stringify(next) !== JSON.stringify(remote)) {
    remote = next;
    ui?.push("pctabs.remote", status());
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
  ui?.push("pctabs.remote", status());
  if (enabled()) { await upload(); await fetchRemote(); }
  askKey();
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
  ui?.push("pctabs.remote", status());
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
  const code = (await r.json()).code || null;
  if (code) waitForJoin(code);
  return code;
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
// Two small encrypted messages ride on the link: "kq" (the new device asks, with a one-off public key) and "ka" (the answer).
// The other device asks its user to confirm, then answers with the wrapped link key. Every linked device answers, not only
// the one that showed a code: it checks for new requests with every poll and every 2 seconds while a code is shown.
// A request counts only once (its time is kept in linkseen) and only when it is under 10 minutes old, because the relay keeps
// the last request for weeks and an old one must not take the place of a new device.
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
function startFast(role, extra) { stopFast(); ex = { role, until: Date.now() + 10 * 60e3, lastT: 0, ...extra }; fast = setInterval(exTick, 2000); }
const JOIN_AGE = 10 * 60e3;
/** A join request no device here has seen yet, or null. Marks it seen. */
async function freshJoin() {
  const m = await get("kq");
  if (!m || m.type !== "join" || !m.session || typeof m.pub !== "string" || typeof m.t !== "number") return null;
  if (String(m.t) === seen().kq) return null;
  markSeen("kq", String(m.t));
  if (Math.abs(Date.now() - m.t) > JOIN_AGE) return null;
  return m;
}
/** From the regular poll: a device asked for the key while no code was shown here. */
async function checkJoin() {
  if (ex || exBusy || !enabled()) return;
  exBusy = true;
  try {
    const m = await freshJoin();
    if (!m || ex) return;
    startFast("origin", { code: "", asking: { session: String(m.session), pub: m.pub } });
    note({ step: "confirm", code: "", session: String(m.session) });
  } finally { exBusy = false; }
}

async function exTick() {
  if (!ex) return;
  if (Date.now() > ex.until) { note({ step: "expired" }); return stopFast(); }
  if (exBusy) return;
  exBusy = true;
  try {
    if (ex.role === "origin") {
      if (ex.asking) return;
      const m = await freshJoin();
      if (!m) return;
      ex.asking = { session: String(m.session), pub: m.pub };
      note({ step: "confirm", code: ex.code, session: ex.asking.session });
    } else {
      const m = await get("ka");
      if (!m || m.session !== ex.session || m.t === ex.lastT) return;
      ex.lastT = m.t;
      if (m.type === "no") { note({ step: "no" }); stopFast(); }
      else if (m.type === "ok" && linkkey.adoptWrapped(ex.pair.priv, m.pub, m.wrap)) {
        const fp = linkkey.fingerprint(ex.pair.pub, m.pub);
        markSeen("sealed", "");
        note({ step: "done", fp });
        stopFast(); slow.at = 0; schedule(); fetchRemote();
      } else if (m.type === "ok") { note({ step: "bad" }); stopFast(); }
    }
  } finally { exBusy = false; }
}

/** The new device, right after linking, or later from Settings: asks the other device for the link key. */
async function askKey() {
  if (!enabled()) return false;
  const pair = linkkey.newPair(), session = crypto.randomBytes(8).toString("hex"), t = Date.now();
  markSeen("kq", String(t));
  if (!(await put("kq", { session, type: "join", pub: pair.pub, t }))) return false;
  startFast("new", { session, pair });
  note({ step: "wait" });
  return true;
}
/** The device that showed [code]: waits for a new device to join. Any request already on the relay counts as old. */
async function waitForJoin(code) {
  const m = await get("kq");
  if (m && typeof m.t === "number") markSeen("kq", String(m.t));
  startFast("origin", { code: String(code), asking: null });
}
/** The user answered the confirm popup. */
async function confirmKey(session, yes) {
  if (!ex || ex.role !== "origin" || !ex.asking || ex.asking.session !== String(session)) return false;
  const { pub } = ex.asking;
  ex.asking = null;
  if (!yes) { await put("ka", { session, type: "no", t: Date.now() }); return true; }
  const w = linkkey.wrapFor(pub);
  if (!w) return false;
  const ok = await put("ka", { session, type: "ok", pub: w.pub, wrap: w.wrap, t: Date.now() });
  if (ok) { note({ step: "sent", fp: linkkey.fingerprint(pub, w.pub) }); stopFast(); }
  return ok;
}

// ---- Unlocking the PC passwords with the phone and/or the link key (pref pcUnlock: pin, phone, key, both) ----
// "ur" (this PC asks) and "ua" (the phone answers) ride on the link like the key exchange. The phone shows a confirm
// dialog and checks the fingerprint or screen lock first. The key check means this PC holds the link key.
async function unlockVault() {
  const mode = prefs.p.pcUnlock || "pin";
  if (mode === "pin") return { error: "Unlocking with the PIN only" };
  if (!enabled()) return { error: "Turn on linking first" };
  if (mode !== "phone" && !linkkey.hasKey()) return { error: "Link this device with a code first" };
  if (mode === "key") { require("./vault").grant(); return { ok: true }; }
  const id = crypto.randomBytes(8).toString("hex"), t = Date.now();
  if (!(await put("ur", { id, t }))) return { error: "Could not reach the phone" };
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const a = await get("ua");
    if (a && a.id === id) {
      if (a.ok) { require("./vault").grant(); return { ok: true }; }
      return { error: "The phone said no" };
    }
  }
  return { error: "The phone did not answer" };
}

const keyStatus = () => linkkey.status();
function forgetKey() { stopFast(); linkkey.forget(); }

const status = () => ({ owner: load().owner, ...remote, error: lastError });

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
  poll = setInterval(async () => { if (enabled() && await outChanged()) upload(); fetchRemote(); checkJoin(); }, POLL_MS);
  keepalive = setInterval(() => { upload(); }, KEEPALIVE_MS);
  poll.unref();
  keepalive.unref();
}

module.exports = { init, schedule, link, reset, pair, pairCode, pairWithCode, control, status, refresh: fetchRemote, confirmKey, askKey, keyStatus, unlockVault, forgetKey };
