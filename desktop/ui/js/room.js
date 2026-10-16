"use strict";
// Server chat: one shared room for everyone linked to the same server.
const ROOM = { L: null, state: { messages: [], error: null, name: "Me" } };

function openRoom() {
  if (ROOM.L) return ROOM.L;
  ROOM.L = openLayer({ key: "room", cls: "spage-layer", dim: false, onClose: () => { ROOM.L = null; inv("room.stop"); } }, (L) => {
    L.note = h("div", { class: "empty", style: "padding:6px 12px" });
    L.thread = h("div", { class: "chat-thread" });
    L.name = h("input", { class: "field", maxlength: "32", placeholder: "Your name" });
    L.name.addEventListener("change", () => inv("room.name", L.name.value).then((n) => { ROOM.state.name = n; roomRender(); }));
    L.ta = h("textarea", { class: "field", rows: "1", placeholder: "Message" });
    const send = async () => {
      const v = L.ta.value.trim(); if (!v) return;
      L.ta.value = "";
      const err = await inv("room.send", v);
      if (err) { L.ta.value = v; toast(err); }
    };
    L.ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    return h("div", { class: "spage" },
      h("div", { class: "sp-main" },
        h("div", { class: "sp-head" }, h("h2", { text: "Server chat" }), ib("close", "Close chat", () => L.close())),
        L.note, L.thread,
        h("div", { class: "ai-in" }, L.name, L.ta, ib("up", "Send", send))));
  });
  inv("room.start").then((s) => { if (s) ROOM.state = s; ROOM.L && (ROOM.L.name.value = ROOM.state.name || ""); roomRender(); });
  return ROOM.L;
}

function roomRender() {
  const L = ROOM.L; if (!L) return;
  L.note.textContent = ROOM.state.error || "Everyone linked to this server is in this room. Messages are not end-to-end encrypted and are kept 24 hours.";
  const stick = L.thread.scrollTop + L.thread.clientHeight >= L.thread.scrollHeight - 40;
  clear(L.thread);
  for (const m of ROOM.state.messages) {
    const mine = m.name === ROOM.state.name;
    L.thread.append(h("div", { class: mine ? "aiq chat-q" : "prose chat-a" },
      mine ? "" : h("div", { style: "color:var(--amber);font-size:12px", text: m.name }), m.text));
  }
  if (stick) L.thread.scrollTop = L.thread.scrollHeight;
}
