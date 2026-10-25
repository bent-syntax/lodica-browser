"use strict";
// AI chat page: saved chats on the left, thread and input on the right.
const CHAT = { L: null, chats: [], cur: null, busy: false };

function openAiChat() {
  if (!S.ai || !S.ai.connected) { toast({ text: "Ask AI isn't set up", actions: [{ label: "Settings", fn: () => openSettings("ai") }] }); return; }
  if (CHAT.L) return CHAT.L;
  CHAT.L = openLayer({ key: "aichat", cls: "spage-layer", dim: false, onClose: () => { CHAT.L = null; } }, (L) => {
    L.side = h("nav", { class: "sp-side chat-side" });
    L.thread = h("div", { class: "chat-thread" });
    L.ta = h("textarea", { class: "field", rows: "1", placeholder: "Message Claude" });
    const send = () => { const v = L.ta.value; L.ta.value = ""; chatSend(v); };
    L.ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    return h("div", { class: "spage" }, L.side,
      h("div", { class: "sp-main" },
        h("div", { class: "sp-head" }, h("h2", { text: "AI chat" }), ib("close", "Close chat", () => L.close())),
        L.thread,
        h("div", { class: "ai-in" }, L.ta, ib("up", "Send", send))));
  });
  inv("ai.chats").then((c) => { CHAT.chats = c || []; CHAT.cur = null; chatRender(); });
  return CHAT.L;
}

function chatRender() {
  const L = CHAT.L; if (!L) return;
  clear(L.side);
  add(L.side, [btn("New chat", () => { CHAT.cur = null; chatRender(); L.ta.focus(); }, "chat-new")]);
  for (const c of CHAT.chats) {
    L.side.append(h("div", { class: "chat-item" + (c.id === CHAT.cur ? " on" : "") },
      h("button", { class: "chat-open", title: c.title, act: () => { CHAT.cur = c.id; chatRender(); } }, c.title || "Chat"),
      ib("delete", "Delete chat", async () => {
        if (!(await confirmDialog({ title: "Delete this chat?", ok: "Delete", danger: true }))) return;
        CHAT.chats = (await inv("ai.chat.delete", c.id)) || [];
        if (CHAT.cur === c.id) CHAT.cur = null;
        chatRender();
      })));
  }
  if (CHAT.usage === undefined) { CHAT.usage = null; inv("ai.usage").then((u) => { CHAT.usage = u || {}; chatRender(); }); }
  const u = CHAT.usage, n = (x) => fmtNum((x || {}).r);
  L.side.append(h("div", { class: "chat-panel" },
    h("div", { class: "cp-h", text: "Memory and usage" }),
    h("button", { class: "cp-row", act: () => openAiMemory() }, ico("ai"), h("span", { text: "Memory" }), ico("chevron", "chev")),
    u ? h("div", { class: "cp-use" }, h("span", { text: "Requests today" }), h("b", { text: n(u.today) }), h("span", { text: "Last 30 days" }), h("b", { text: n(u.month) })) : null));
  clear(L.thread);
  const c = CHAT.chats.find((x) => x.id === CHAT.cur);
  if (!c) { L.thread.append(h("div", { class: "empty", text: "Ask anything. Chats are saved here and on your linked phone." })); return; }
  for (const m of c.messages) L.thread.append(chatMsg(m));
  L.thread.scrollTop = L.thread.scrollHeight;
}

function chatMsg(m) {
  if (m.role === "user") return h("div", { class: "aiq chat-q", text: m.text });
  return h("div", { class: "prose chat-a" }, m.text,
    h("div", { style: "margin-top:6px" }, ib("copy", "Copy", () => { navigator.clipboard.writeText(m.text).catch(() => {}); toast("Copied"); })));
}

async function chatSend(text) {
  text = (text || "").trim(); const L = CHAT.L;
  if (!text || !L || CHAT.busy) return;
  CHAT.busy = true;
  const id = CHAT.cur || "";
  const c = CHAT.chats.find((x) => x.id === id);
  if (!c) clear(L.thread);
  L.thread.append(h("div", { class: "aiq chat-q", text }));
  const wait = h("div", { class: "think" }, h("span", { class: "spin" }), "Researching…");
  L.thread.append(wait); L.thread.scrollTop = L.thread.scrollHeight;
  const r = await inv("ai.chat.send", id, text);
  CHAT.busy = false;
  if (!CHAT.L) return;
  if (!r || r.error) {
    wait.replaceWith(h("div", { class: "think", style: "color:var(--coral)" }, (r && r.error) || "Request failed"));
    return;
  }
  CHAT.chats = (await inv("ai.chats")) || [];
  CHAT.cur = r.id;
  chatRender();
}
