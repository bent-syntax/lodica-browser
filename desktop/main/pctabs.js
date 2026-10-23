// "Tabs on PC" sync: encrypted tab lists exchanged through the relay under one shared secret.
// The secret holds a 16-byte id seed and a 32-byte AES key. The device that created it (owner) writes the
// base id and reads the derived id; a device that adopted a link (peer) does the opposite. The link shown on
// every device is the base-id viewer link, so it doubles as the pairing code.
const crypto = require("crypto");
const store = require("./store");
const prefs = require("./prefs");
const relay = require("./relay");
const history = require("./history");

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
const auth = () => ({ Authorization: "Bearer " + relay.token });

function payload() {
  const list = tabs.all().filter(t => !t.private && !t.archived && /^https?:/.test(t.url))
    .map(t => ({ title: t.title || t.url, url: t.url, private: false }));
  // Chats ride along in the same encrypted blob; they are the first thing dropped when it gets too big.
  let chats = ai ? ai.chats.raw() : [];
  let hist = prefs.p.shareHistory ? history.recent(300) : undefined;
  const build = () => JSON.stringify({ updated: Date.now(), tabs: list, chats, history: hist });
  let out = build();
  while (Buffer.byteLength(out) > MAX - 1024 && (chats.length || hist?.length)) {
    if (hist?.length) hist = hist.slice(0, Math.floor(hist.length / 2));
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
  const body = encrypt(payload(), key);
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
      if (prefs.p.shareHistory && Array.isArray(j.history)) history.merge(j.history);
      const list = Array.isArray(j.tabs) ? j.tabs : [];
      next = {
        updated: Number(j.updated) || 0,
        tabs: list.filter(t => t && /^https?:\/\//i.test(String(t.url))).slice(0, 200)
          .map(t => ({ title: String(t.title || t.url).slice(0, 300), url: String(t.url) })),
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

const status = () => ({ owner: load().owner, ...remote });

function init(deps) {
  tabs = deps.tabs;
  ai = deps.ai;
  ui = deps.ui;
  if (ai) ai.chats.onChange(() => { schedule(); ui?.push("ai.chats", ai.chats.get()); });
  prefs.events.on("change", k => { if ((k === "pcTabs" || k === "shareHistory") && prefs.p.pcTabs) { schedule(); fetchRemote(); } });
  schedule();
  fetchRemote();
  poll = setInterval(() => { fetchRemote(); }, POLL_MS);
  keepalive = setInterval(() => { upload(); }, KEEPALIVE_MS);
  poll.unref();
  keepalive.unref();
}

module.exports = { init, schedule, link, reset, pair, pairCode, pairWithCode, control, status, refresh: fetchRemote };
