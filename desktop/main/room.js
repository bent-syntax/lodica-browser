// Same-server chat room, mirrored from the Android Room object. Long-polls the relay's /api/chat.
const { EventEmitter } = require("events");
const relay = require("./relay");
const store = require("./store");

const events = new EventEmitter();
const state = { messages: [], error: null, name: store.load("roomName", "") || "Me" };
let running = false, last = -1, gen = 0;

function changed() { events.emit("change"); }

async function loop(my) {
  while (running && my === gen) {
    try {
      const q = last < 0 ? "" : `?after=${last}&wait=20`;
      const [status, body] = await relay.request("GET", "/api/chat" + q, 35000);
      if (status !== 200) throw new Error("HTTP " + status);
      const o = JSON.parse(body);
      const fresh = (o.messages || []).filter(m => !state.messages.some(x => x.id === m.id));
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

/** Posts a message; resolves to an error string or null. */
async function send(text) {
  try {
    const [status] = await relay.request("POST", "/api/chat", 15000, { name: state.name, text: String(text || "") });
    if (status === 200) { if (running) { /* the poll delivers it */ } return null; }
    return status === 429 ? "Slow down a little" : "Server answered " + status;
  } catch { return "Can't reach the server"; }
}

module.exports = { state, events, start, stop, send, setName };
