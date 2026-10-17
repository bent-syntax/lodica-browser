// Same-server chat room, mirrored from the Android Room object. Long-polls the relay's /api/chat.
const { EventEmitter } = require("events");
const relay = require("./relay");
const store = require("./store");

const events = new EventEmitter();
const state = { messages: [], error: null, name: store.load("roomName", "") || "Me", room: "", chats: store.load("roomChats", []) || [] };
let running = false, last = -1, gen = 0;

// Must match the Android Room.clean and the relay's room pattern: no whitespace of any kind, no control characters, no "|".
const clean = n => String(n || "").replace(/[\s|\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200f\u2028\u2029\ufeff]/g, "_").slice(0, 32) || "_";
const roomQ = r => (r ? "&room=" + encodeURIComponent(r) : "");

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
  loop(++gen);
  return state;
}

function stop() { running = false; gen++; }

function setName(v) {
  state.name = String(v || "").trim().slice(0, 32) || "Me";
  store.save("roomName", () => state.name);
  return state.name;
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
  state.room = String(r || ""); state.messages = []; state.error = null; last = -1;
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

/** Posts a message; resolves to an error string or null. */
async function send(text) {
  try {
    const [status] = await relay.request("POST", "/api/chat", 15000, { name: state.name, text: String(text || ""), room: state.room });
    if (status === 200) { if (running) { /* the poll delivers it */ } return null; }
    return status === 429 ? "Slow down a little" : status === 400 ? "Message not sent: this chat name is not valid" : "Server answered " + status;
  } catch { return "Can't reach the server"; }
}

// Background check for the notifier: new messages from others in any room, while the chat is closed.
let bgLast = -1;
async function peek() {
  if (!relay.available || running) return [];
  const out = [];
  let newLast = bgLast;
  await users(); // presence, so others can pick this device
  await discover(); // private chats others started with this name
  for (const r of ["", ...state.chats]) {
    try {
      const [status, body] = await relay.request("GET", `/api/chat?after=${Math.max(bgLast, 0)}${roomQ(r)}`, 15000);
      if (status !== 200) continue;
      const o = JSON.parse(body);
      newLast = Math.max(newLast, o.last || 0);
      if (bgLast < 0) continue;
      const mine = (o.messages || []).filter(m => m.name !== state.name);
      if (mine.length) out.push({ room: r, where: r ? label(r) : "server chat", messages: mine });
    } catch {}
  }
  bgLast = newLast;
  return out;
}

module.exports = { state, events, start, stop, send, setName, select, addChat, removeChat, dm, group, label, discover, users, peek };
