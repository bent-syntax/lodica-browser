// Support desk client, mirrors the Android Support object. One open ticket; the team's answers and
// questions arrive as desktop notifications and appear in the support sheet.
const { Notification } = require("electron");
const relay = require("./relay");
const store = require("./store");
const os = require("os");

const state = { id: store.load("supportTicket", "") || "", seen: store.load("supportSeen", 0) || 0, status: "", messages: [], link: store.load("supportLink", "") || "", email: store.load("supportEmail", "") || "" };
const persist = () => { store.save("supportTicket", () => state.id); store.save("supportSeen", () => state.seen); store.save("supportLink", () => state.link); store.save("supportEmail", () => state.email); };

function notify(title, body, onClick) {
  // In-app toast always, since system notifications can be missing or muted (e.g. on Linux).
  try { require("./ui").toast(title + ": " + body.slice(0, 120), onClick ? "Open" : undefined).then((ok) => { if (ok && onClick) onClick(); }).catch(() => {}); } catch {}
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  if (onClick) n.on("click", onClick);
  n.show();
}

function apply(t, notifyTeam, onClick) {
  const list = (t.messages || []).map((m) => ({ fromUser: m.from === "user", text: m.text, images: m.images || [] }));
  if (notifyTeam && list.length > state.seen) {
    const fresh = list.slice(state.seen).filter((m) => !m.fromUser);
    if (fresh.length) notify(t.status === "done" || t.status === "awaiting-confirm" ? "Support: your issue is fixed" : t.status === "needs-info" ? "Support needs more information" : "Support replied", fresh[fresh.length - 1].text, onClick);
  }
  // A fixed or closed request ends the session: drop the old chat and keep only the last message from the team.
  const ended = t.status === "done" || t.status === "closed";
  const lastTeam = list.filter((m) => !m.fromUser).pop();
  state.id = t.id; state.seen = list.length; state.status = t.status; state.messages = ended ? (lastTeam ? [lastTeam] : []) : list;
  persist();
}

async function send(text, images = [], resolved = false, category = "", onClick) {
  if (!relay.available) return { error: "No relay is set up. Pair this browser with your server first." };
  const id = state.status === "closed" || state.status === "done" ? "" : state.id;
  if (!state.link) return { error: "Link your email first." };
  const body = { text };
  if (images.length) body.images = images;
  if (resolved && id) body.resolved = true;
  body.link = state.link;
  if (!id && !["bug", "question", "idea", "other"].includes(category)) return { error: "Pick a reason first." };
  if (!id) body.category = category;
  if (!id) Object.assign(body, { name: require("./room").state.name, app: "desktop", version: require("../package.json").lodicaVersion || require("electron").app.getVersion(), platform: process.platform + " " + os.release() });
  try {
    const [st, resp] = await relay.request("POST", id ? "/api/support/" + id : "/api/support", 15000, body);
    if (st === 404 && id) { state.id = ""; state.seen = 0; state.messages = []; persist(); return send(text, images, resolved, category, onClick); }
    if (st !== 200) return { error: resp || "Support refused the message (" + st + ")" };
    apply(JSON.parse(resp), false);
    notify("Message sent to support", id ? "Support has your reply." : "We got your message. You'll be notified when there's an update or a question.", onClick);
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

const get = () => ({ messages: state.messages, last: state.status === "done" || state.status === "closed" ? (state.messages[0] || null) : null, status: state.status, open: state.messages.length > 0 && state.status !== "closed" && state.status !== "done", email: state.link ? state.email : "" });

// Fetches one attached image's bytes through the authenticated relay client and hands back a data URL,
// since a bare <img src> can't carry the bearer token the relay needs.
async function image(name) {
  if (!state.id || !relay.available) return null;
  try {
    const [st, buf] = await relay.requestRaw("GET", "/api/support/" + encodeURIComponent(state.id) + "/img/" + encodeURIComponent(name), 15000);
    if (st !== 200 || !buf || !buf.length) return null;
    const ext = name.endsWith(".png") ? "png" : "jpeg";
    return "data:image/" + ext + ";base64," + buf.toString("base64");
  } catch { return null; }
}

// Linking an email: the desk mails a code, the code gives a link token. Then mail from that address counts as a
// request, and requests from here also get updates by email.
async function linkCall(step, body) {
  if (!relay.available) return { error: "No relay is set up. Pair this browser with your server first." };
  try {
    const [st, resp] = await relay.request("POST", "/api/support/link/" + step, 25000, body);
    let j = {}; try { j = JSON.parse(resp); } catch {}
    return st === 200 ? j : { error: j.error || resp || "Support refused it (" + st + ")" };
  } catch { return { error: "Can't reach the server. Try again later." }; }
}
const linkStart = (email) => linkCall("start", { email });
async function linkVerify(email, code) {
  const r = await linkCall("verify", { email, code });
  if (r.error) return r;
  if (!/^[0-9a-f]{64}$/.test(r.link || "")) return { error: "Support sent an odd answer. Try again." };
  state.link = r.link; state.email = r.email || email; persist();
  return get();
}
async function unlink() {
  if (state.link) await linkCall("remove", { link: state.link });
  state.link = ""; state.email = ""; persist();
  return get();
}
async function open() { await refresh(false); return get(); }
function watch(onClick) { setTimeout(() => refresh(true, onClick), 20000); setInterval(() => { if (state.status !== "closed") refresh(true, onClick); }, 30 * 1000); }

module.exports = { send, open, watch, linkStart, linkVerify, unlink, image };
