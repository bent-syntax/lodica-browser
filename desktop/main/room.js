// Same-server chat room, mirrored from the Android Room object. Long-polls the relay's /api/chat.
const { EventEmitter } = require("events");
const relay = require("./relay");
const store = require("./store");

const events = new EventEmitter();
const os = require("os");
// New installs start with the computer's name; a stored name always wins.
const state = { messages: [], error: null, name: store.load("roomName", "") || String(os.hostname() || "").replace(/\.local$/i, "").trim().slice(0, 32) || "Me", names: store.load("roomNames", []) || [], room: "", chats: store.load("roomChats", []) || [], pending: [] };
let running = false, last = -1, gen = 0;

// Must match the Android Room.clean and the relay's room pattern: no whitespace of any kind, no control characters, no "|".
const clean = n => String(n || "").replace(/[\s|\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200f\u2028\u2029\ufeff]/g, "_").slice(0, 32) || "_";
const roomQ = r => (r ? "&room=" + encodeURIComponent(r) : "");

/** Remembers every name this device has used, so older messages stay "mine" (under the name they were sent with) after a rename. */
function rememberName(n) {
  if (!n || state.names.includes(n)) return;
  state.names.push(n); state.names = state.names.slice(-20);
  store.save("roomNames", () => state.names);
}
const isMine = n => n === state.name || state.names.includes(n);
rememberName(state.name);
function changed() { events.emit("change"); }

async function loop(my) {
  while (running && my === gen) {
    try {
      const room = state.room;
      const q = last < 0 ? "?" + roomQ(room).slice(1) : `?after=${last}&wait=20${roomQ(room)}`;
      const [status, body] = await relay.request("GET", "/api/chat" + q, 35000);
      if (status !== 200) throw new Error("HTTP " + status);
      const o = JSON.parse(body);
      if (my !== gen) return;
      const fresh = (o.messages || []).filter(m => (m.room || "") === room && !state.messages.some(x => x.id === m.id));
      if (fresh.length) state.messages = state.messages.concat(fresh).slice(-200);
      last = typeof o.last === "number" ? o.last : last;
      if (outbox.length) flush();
      if (fresh.length || state.error) { state.error = null; changed(); }
    } catch {
      if (!running || my !== gen) return;
      state.error = "Can't reach the server";
      changed();
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

function start() {
  if (running || !relay.available) return state;
  running = true;
  settleName();
  loop(++gen);
  return state;
}

function stop() { running = false; gen++; }

function deviceId() {
  let id = store.load("roomDeviceId", "");
  if (!/^[\w-]{8,64}$/.test(id)) { id = require("crypto").randomBytes(16).toString("hex"); store.save("roomDeviceId", () => id); }
  return id;
}

/** Asks the relay to reserve [name] for this device. Resolves true when free or the relay can't say (offline, older relay). */
async function claim(name) {
  try {
    const [status] = await relay.request("GET", "/api/chat/claim?name=" + encodeURIComponent(name) + "&id=" + deviceId(), 15000);
    return status !== 409;
  } catch { return true; }
}

/** Reserves the current name at startup. When another device holds it (two computers with the same host name), appends -2, -3, ... */
async function settleName() {
  const base = state.name;
  for (let i = 1; i <= 20; i++) {
    const n = i === 1 ? base : base.slice(0, 32 - String(i).length - 1) + "-" + i;
    if (await claim(n)) {
      if (n !== state.name) { state.name = n; rememberName(n); store.save("roomName", () => state.name); changed(); }
      return;
    }
  }
}

/** Sets the chat name. Resolves { name, taken }: when another device holds the name the old one is kept. */
async function setName(v) {
  const want = String(v || "").trim().slice(0, 32) || "Me";
  if (want === state.name) { await claim(want); return { name: state.name, taken: false }; }
  if (!(await claim(want))) return { name: state.name, taken: true };
  state.name = want; rememberName(want);
  store.save("roomName", () => state.name);
  return { name: state.name, taken: false };
}

/** Room id of the private chat between this device's name and [peer]. */
function dm(peer) { return "dm:" + [clean(state.name), clean(peer)].sort((a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0; }).join("|"); }
function group(name) { return "grp:" + String(name || "").replace(/[^\w .-]/g, "").trim().slice(0, 32); }
function label(r) {
  if (!r) return "Everyone";
  if (r.startsWith("grp:")) return r.slice(4);
  return r.slice(3).split("|").find(x => x !== clean(state.name)) || r.slice(3);
}

function addChat(r) {
  if (typeof r === "string" && r.length > 4 && !state.chats.includes(r)) { state.chats.push(r); store.save("roomChats", () => state.chats); }
  changed();
  return state;
}

function removeChat(r) {
  state.chats = state.chats.filter(x => x !== r);
  store.save("roomChats", () => state.chats);
  return state.room === r ? select("") : (changed(), state);
}

/** Switches conversation and restarts the long poll. */
function select(r) {
  state.room = String(r || ""); state.messages = []; state.error = null; last = -1; syncPending();
  const was = running;
  gen++;
  if (was) loop(gen);
  changed();
  return state;
}

/** Private chats others have started with this device's name. */
async function discover() {
  try {
    const [status, body] = await relay.request("GET", "/api/chat/rooms", 15000);
    if (status !== 200) return state;
    const me = clean(state.name);
    for (const x of JSON.parse(body).rooms || []) if (x.room.startsWith("dm:") && x.room.slice(3).split("|").includes(me)) addChat(x.room);
  } catch {}
  return state;
}

/** Device names seen on the server, without this device. Also registers this device as present. */
async function users() {
  try {
    const [status, body] = await relay.request("GET", "/api/chat/users?name=" + encodeURIComponent(state.name), 15000);
    if (status !== 200) return [];
    const me = clean(state.name);
    return (JSON.parse(body).users || []).map(u => u.name).filter(n => n && clean(n) !== me);
  } catch { return []; }
}

// Messages that could not be delivered (server down or unreachable) wait here, saved to disk, and go out in order once the server answers.
const outbox = (store.load("roomOutbox", []) || []).filter(m => m && typeof m.text === "string");
let flushing = false, flushTimer = null;
const MAX_OUTBOX = 200;

function syncPending() { state.pending = outbox.filter(m => m.room === state.room).map(m => m.text); }
syncPending();

function saveOutbox() { store.save("roomOutbox", () => outbox); syncPending(); changed(); }

/** POSTs one message. Resolves { ok } on success, { retry } for a down server, { error } for a refusal that retrying cannot fix. */
async function post(m) {
  try {
    const [status] = await relay.request("POST", "/api/chat", 15000, { name: m.name, text: m.text, room: m.room });
    if (status === 200) return { ok: true };
    if (status === 429) return { retry: true, error: "Slow down a little" };
    if (status >= 500 || status === 408) return { retry: true, error: "Server answered " + status };
    return { error: status === 400 ? "Message not sent: this chat name is not valid" : "Server answered " + status };
  } catch { return { retry: true, error: "Can't reach the server" }; }
}

function schedule(ms) {
  if (flushTimer || !outbox.length) return;
  flushTimer = setTimeout(() => { flushTimer = null; flush(); }, ms);
  flushTimer.unref?.();
}

/** Sends queued messages oldest first; stops at the first failure and tries again later. */
async function flush() {
  if (flushing || !outbox.length) return;
  flushing = true;
  let delay = 5000;
  try {
    while (outbox.length) {
      const r = await post(outbox[0]);
      if (r.retry) { if (r.error === "Slow down a little") delay = 15000; break; }
      outbox.shift();
      saveOutbox();
    }
  } finally { flushing = false; }
  schedule(delay);
}

/** Posts a message; resolves to an error string or null. A message the server cannot take right now is queued and sent later. */
async function send(text) {
  const m = { name: state.name, text: String(text || ""), room: state.room, at: Date.now() };
  if (!m.text.trim()) return null;
  if (outbox.length) {
    // Keep order: nothing jumps the queue.
    if (outbox.length >= MAX_OUTBOX) return "Too many unsent messages";
    outbox.push(m); saveOutbox(); flush();
    return null;
  }
  const r = await post(m);
  if (r.ok) return null;
  if (!r.retry) return r.error;
  outbox.push(m); saveOutbox(); schedule(5000);
  return null;
}

// Messages left over from a previous run go out as soon as the app is up.
setTimeout(flush, 3000).unref?.();

const MAX_FILE = 5 * 1024 * 1024 * 1024;
const safeName = n => require("path").basename(String(n || "file")).replace(/[\u0000-\u001f\u007f-\u009f"*:<>?|\\/]/g, "_").replace(/^\.+/, "") || "file";

/** Uploads a file from disk into the current chat. Resolves to an error string or null. */
async function upload(filePath) {
  const fs = require("fs");
  let size;
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return "Not a file";
    if (st.size > MAX_FILE) return "File is larger than 5 GB";
    if (!st.size) return "File is empty";
    size = st.size;
  } catch { return "Can't read that file"; }
  const name = safeName(filePath);
  state.upload = { name, pct: 0 };
  changed();
  try {
    let dims = "";
    try { const sz = require("electron").nativeImage.createFromPath(filePath).getSize(); if (sz.width > 0 && sz.height > 0) dims = "&w=" + sz.width + "&h=" + sz.height; } catch {}
    const q = "?name=" + encodeURIComponent(name) + "&from=" + encodeURIComponent(state.name) + dims + roomQ(state.room);
    const [status, body] = await relay.uploadFile("/api/chat/file" + q, filePath, size, f => { const pct = Math.round(f * 100); if (!state.upload || state.upload.pct !== pct) { state.upload = { name, pct }; changed(); } });
    if (status === 200) return null;
    return status === 415 ? "This file type is not allowed" : status === 413 ? "File is larger than 5 GB" : status === 507 ? "The chat file store is full, try later" : status === 411 ? "Server answered 411" : status === 429 ? "Slow down a little" : status === 400 ? "Not sent: " + body.toString().slice(0, 60) : "Server answered " + status;
  } catch { return "Can't reach the server"; }
  finally { state.upload = null; changed(); }
}

/** Fetches an attachment. Images (verified by the relay) come back as a data URL for the preview; [save] writes the file to a path. */
async function fetchFile(id, savePath) {
  if (!/^[0-9a-f]{24}$/.test(String(id))) return null;
  try {
    if (savePath) return (await relay.downloadTo("/api/chat/file/" + id + "?dl=1", savePath)) === 200 ? true : null;
    const m = state.messages.find(x => x.file && x.file.id === id);
    const type = m && m.file.type;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(type || "") || m.file.size > 20 * 1024 * 1024) return null; // previews stay small
    const [status, buf] = await relay.requestRaw("GET", "/api/chat/file/" + id, 60000);
    return status === 200 ? "data:" + type + ";base64," + buf.toString("base64") : null;
  } catch { return null; }
}

// Background check for the notifier: new messages from others in any room, while the chat is closed.
const bgCur = new Map(); // room -> last chat id seen by the background watcher, -1 until the first answer
const watching = new Set();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Background watcher for desktop notifications. One long poll per room, so a new message reaches
 * onGroup within a second or so instead of waiting for the next timer tick.
 */
function watch(onGroup) {
  async function loop(r) {
    watching.add(r);
    while (r === "" || state.chats.includes(r)) {
      if (!relay.available || running) { await sleep(5000); continue; }
      try {
        const cur = bgCur.has(r) ? bgCur.get(r) : -1;
        const [status, body] = await relay.request("GET", `/api/chat?after=${Math.max(cur, 0)}&wait=25${roomQ(r)}`, 40000);
        if (status !== 200) { await sleep(5000); continue; }
        const o = JSON.parse(body);
        bgCur.set(r, Math.max(cur, o.last || 0));
        if (cur < 0) continue;
        const mine = (o.messages || []).filter(m => !isMine(m.name));
        if (mine.length && !running) onGroup({ room: r, where: r ? label(r) : "server chat", messages: mine });
        if (!(o.messages || []).length) await sleep(200);
      } catch { await sleep(5000); }
    }
    watching.delete(r);
  }
  const tick = async () => {
    if (relay.available && !running) { await users().catch(() => {}); await discover().catch(() => {}); }
    for (const r of ["", ...state.chats]) if (!watching.has(r)) loop(r);
  };
  tick();
  setInterval(tick, 60 * 1000);
}

module.exports = { state, events, start, stop, send, upload, fetchFile, safeName, setName, select, addChat, removeChat, dm, group, label, discover, users, watch };
