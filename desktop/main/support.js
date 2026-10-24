// Support desk client, mirrors the Android Support object. One open ticket; the team's answers and
// questions arrive as desktop notifications and appear in the support sheet.
const { Notification } = require("electron");
const relay = require("./relay");
const store = require("./store");
const os = require("os");

const state = { id: store.load("supportTicket", "") || "", seen: store.load("supportSeen", 0) || 0, status: "", messages: [] };
const persist = () => { store.save("supportTicket", () => state.id); store.save("supportSeen", () => state.seen); };

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  if (onClick) n.on("click", onClick);
  n.show();
}

function apply(t, notifyTeam, onClick) {
  const list = (t.messages || []).map((m) => ({ fromUser: m.from === "user", text: m.text }));
  if (notifyTeam && list.length > state.seen) {
    const fresh = list.slice(state.seen).filter((m) => !m.fromUser);
    if (fresh.length) notify(t.status === "done" ? "Support: your issue is fixed" : t.status === "needs-info" ? "Support needs more information" : "Support replied", fresh[fresh.length - 1].text, onClick);
  }
  state.id = t.id; state.seen = list.length; state.status = t.status; state.messages = list;
  persist();
}

async function send(text, onClick) {
  if (!relay.available) return { error: "No relay is set up. Pair this browser with your server first." };
  const id = state.status === "closed" ? "" : state.id;
  const body = { text };
  if (!id) Object.assign(body, { name: require("./room").state.name, app: "desktop", version: require("../package.json").lodicaVersion || require("electron").app.getVersion(), platform: process.platform + " " + os.release() });
  try {
    const [st, resp] = await relay.request("POST", id ? "/api/support/" + id : "/api/support", 15000, body);
    if (st === 404 && id) { state.id = ""; state.seen = 0; state.messages = []; persist(); return send(text, onClick); }
    if (st !== 200) return { error: resp || "Support refused the message (" + st + ")" };
    apply(JSON.parse(resp), false);
    if (!id) notify("Message sent to support", "We got your message. You'll be notified when there's an update or a question.", onClick);
    return get();
  } catch { return { error: "Can't reach the server. Try again later." }; }
}

async function refresh(notifyTeam, onClick) {
  if (!state.id || !relay.available) return;
  try {
    const [st, resp] = await relay.request("GET", "/api/support/" + encodeURIComponent(state.id));
    if (st === 404) { state.id = ""; state.seen = 0; state.messages = []; state.status = ""; persist(); return; }
    if (st === 200) apply(JSON.parse(resp), notifyTeam, onClick);
  } catch {}
}

const get = () => ({ messages: state.messages, status: state.status, open: state.messages.length > 0 && state.status !== "closed" });
async function open() { await refresh(false); return get(); }
function watch(onClick) { setTimeout(() => refresh(true, onClick), 20000); setInterval(() => refresh(true, onClick), 2 * 60 * 1000); }

module.exports = { send, open, watch };
