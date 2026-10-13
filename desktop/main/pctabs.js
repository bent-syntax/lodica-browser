// "Tabs on PC" sync: encrypted tab lists exchanged through the relay under one shared secret.
// The secret holds a 16-byte id seed and a 32-byte AES key. The device that created it (owner) writes the
// base id and reads the derived id; a device that adopted a link (peer) does the opposite. The link shown on
// every device is the base-id viewer link, so it doubles as the pairing code.
const crypto = require("crypto");
const store = require("./store");
const prefs = require("./prefs");
const relay = require("./relay");

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
  let out = JSON.stringify({ updated: Date.now(), tabs: list, chats });
  while (Buffer.byteLength(out) > MAX - 1024 && chats.length) {
    chats = chats.slice().sort((a, b) => b.updated - a.updated).slice(0, Math.floor(chats.length / 2));
    out = JSON.stringify({ updated: Date.now(), tabs: list, chats });
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

const status = () => ({ owner: load().owner, ...remote });

function init(deps) {
  tabs = deps.tabs;
  ai = deps.ai;
  ui = deps.ui;
  if (ai) ai.chats.onChange(() => { schedule(); ui?.push("ai.chats", ai.chats.get()); });
  prefs.events.on("change", k => { if (k === "pcTabs" && prefs.p.pcTabs) { schedule(); fetchRemote(); } });
  schedule();
  fetchRemote();
  poll = setInterval(() => { fetchRemote(); }, POLL_MS);
  keepalive = setInterval(() => { upload(); }, KEEPALIVE_MS);
  poll.unref();
  keepalive.unref();
}

module.exports = { init, schedule, link, reset, pair, status, refresh: fetchRemote };
