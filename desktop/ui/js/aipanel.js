"use strict";
// Right-hand AI panel: chat or browse mode, older chats, full screen and minimize. Runs in its own view.
const inv = (...a) => window.lodica.invoke(...a);
const $ = id => document.getElementById(id);
const applyPrefs = p => { document.documentElement.dataset.theme = (p && p.theme) || "system"; };
inv("prefs.all").then(applyPrefs);
window.lodica.on("prefs", applyPrefs);

const P = { chats: [], cur: null, busy: false, browse: false, run: null };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function scroll() { $("thread").scrollTop = $("thread").scrollHeight; }
function render() {
  const t = $("thread"); t.textContent = "";
  const c = P.chats.find(x => x.id === P.cur);
  $("title").textContent = c ? c.title || "Chat" : "Lodica AI";
  if (!c && !P.run) t.append(el("div", "empty", "Ask anything, or switch to Browse and let the AI use the browser for you."));
  if (c) for (const m of c.messages) t.append(el("div", m.role === "user" ? "q" : "a", m.text));
  if (P.run) for (const n of P.run.nodes) t.append(n);
  scroll();
}
const load = () => inv("ai.chats").then(c => { P.chats = c || []; render(); });

function setBusy(b, label) {
  P.busy = b;
  $("working").hidden = !(P.run && P.run.agent);
  if (label) $("wtext").textContent = label;
  $("ta").disabled = b;
}

async function send() {
  const text = $("ta").value.trim();
  if (!text || P.busy) return;
  $("ta").value = ""; $("ta").style.height = "";
  if (P.browse) return browse(text);
  const c = P.chats.find(x => x.id === P.cur);
  const shown = c ? c.messages.slice() : [];
  P.run = { agent: false, nodes: [el("div", "q", text), el("div", "step", "Thinking…")] };
  const prior = shown.map(m => el("div", m.role === "user" ? "q" : "a", m.text));
  render(); $("thread").prepend(...prior); scroll();
  setBusy(true);
  const r = await inv("ai.chat.send", P.cur || "", text).catch(e => ({ error: String(e.message || e) }));
  P.run = null; setBusy(false);
  if (r && r.id) P.cur = r.id;
  await load();
  if (r && r.error) $("thread").append(el("div", "a err", r.error));
  scroll(); $("ta").focus();
}

async function browse(goal) {
  P.run = { agent: true, nodes: [el("div", "q", goal)] };
  render(); setBusy(true, "Working in the browser…");
  const r = await inv("ai.agent.start", goal).catch(e => ({ error: String(e.message || e) }));
  const n = el("div", r && r.text ? "a" : "a err", (r && (r.text || r.error)) || "Done");
  P.run.nodes.push(n);
  P.run.agent = false; setBusy(false);
  const keep = P.run; render();
  P.run = null; // thread keeps the result until the next render from chats
  void keep; $("ta").focus();
}

window.lodica.on("agent", p => {
  if (!P.run || !p || !p.step) return;
  P.run.nodes.push(el("div", "step", p.step));
  $("wtext").textContent = p.step;
  const t = $("thread"); t.append(P.run.nodes[P.run.nodes.length - 1]); scroll();
});
window.lodica.on("aipanel", d => { if (d && d.open) { load(); $("ta").focus(); } });

function history() {
  const h = $("hist");
  if (!h.hidden) { h.hidden = true; return; }
  h.textContent = "";
  if (!P.chats.length) h.append(el("div", "none", "No chats yet"));
  for (const c of P.chats) {
    const b = el("button", c.id === P.cur ? "on" : "", c.title || "Chat");
    b.title = c.title || "";
    b.addEventListener("click", () => { P.cur = c.id; P.run = null; h.hidden = true; render(); });
    h.append(b);
  }
  h.hidden = false;
}

$("hb").addEventListener("click", () => { load().then(history); });
$("nb").addEventListener("click", () => { if (P.busy) return; P.cur = null; P.run = null; $("hist").hidden = true; render(); $("ta").focus(); });
$("fb").addEventListener("click", () => inv("ai.panel.full"));
$("mb").addEventListener("click", () => inv("ai.panel.close"));
$("stop").addEventListener("click", () => inv("ai.agent.stop"));
$("send").addEventListener("click", send);
$("ta").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
$("ta").addEventListener("input", () => { const t = $("ta"); t.style.height = "auto"; t.style.height = Math.min(120, t.scrollHeight) + "px"; });
const mode = b => { P.browse = b; $("mbrowse").classList.toggle("on", b); $("mchat").classList.toggle("on", !b); $("ta").placeholder = b ? "What should the AI do in the browser?" : "Message Claude"; };
$("mchat").addEventListener("click", () => mode(false));
$("mbrowse").addEventListener("click", () => mode(true));
document.addEventListener("click", e => { if (!e.target.closest("#hist,#hb")) $("hist").hidden = true; });
inv("ai.agent.active").then(a => { if (a) { P.run = { agent: true, nodes: [el("div", "step", "The AI is working in the browser…")] }; setBusy(true, "Working in the browser…"); render(); } });
load();
