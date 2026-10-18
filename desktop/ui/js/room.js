"use strict";
// Server chat: one shared room for everyone linked to the same server.
const ROOM = { L: null, state: { messages: [], error: null, name: "Me", room: "", chats: [] } };

function openRoom() {
  if (ROOM.L) return ROOM.L;
  ROOM.L = openLayer({ key: "room", cls: "spage-layer", dim: false, onClose: () => { ROOM.L = null; inv("room.stop"); } }, (L) => {
    L.tabs = h("div", { class: "chat-tabs", style: "display:flex;gap:6px;flex-wrap:wrap;padding:6px 12px" });
    L.note = h("div", { class: "empty", style: "padding:6px 12px" });
    L.thread = h("div", { class: "chat-thread" });
    L.name = h("input", { class: "field", maxlength: "32", placeholder: "Your name" });
    L.name.addEventListener("change", () => inv("room.name", L.name.value).then((r) => { ROOM.state.name = r.name; L.name.value = r.name; if (r.taken) toast("That name is already used by another device"); roomRender(); }));
    L.ta = h("textarea", { class: "field", rows: "1", placeholder: "Message" });
    const send = async () => {
      const v = L.ta.value.trim(); if (!v) return;
      L.ta.value = "";
      const err = await inv("room.send", v);
      if (err) { L.ta.value = v; toast(err); }
    };
    L.ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    L.prog = h("div", { class: "empty", style: "padding:0 12px;display:none" });
    const attach = async () => {
      const err = await inv("room.upload");
      if (err) toast(err);
    };
    return h("div", { class: "spage" },
      h("div", { class: "sp-main" },
        h("div", { class: "sp-head" }, h("h2", { text: "Server chat" }), ib("close", "Close chat", () => L.close())),
        L.tabs, L.note, L.thread, L.prog,
        h("div", { class: "ai-in" }, L.name, L.ta, ib("clip", "Send a file (max 5 MB)", attach), ib("up", "Send", send))));
  });
  inv("room.discover").then((s) => { if (s) { ROOM.state = s; roomRender(); } });
  inv("room.start").then((s) => { if (s) ROOM.state = s; ROOM.L && (ROOM.L.name.value = ROOM.state.name || ""); roomRender(); });
  return ROOM.L;
}

// An attachment: never opened or run, only previewed (verified images) or saved by the user.
function roomFile(f) {
  const kb = f.size < 1024 * 1024 ? Math.max(1, Math.round(f.size / 1024)) + " KB" : (f.size / 1048576).toFixed(1) + " MB";
  const box = h("div", { style: "display:flex;flex-direction:column;gap:4px" });
  const save = h("button", { class: "btn", text: "Save " + f.name + " (" + kb + ")" });
  save.addEventListener("click", () => inv("room.save", f.id, f.name).then((ok) => { if (ok) toast("Saved"); else if (ok === false) toast("Download failed"); }));
  box.append(save);
  if (/^image\//.test(f.type)) {
    const view = h("button", { class: "btn", text: "Preview" });
    view.addEventListener("click", () => inv("room.preview", f.id).then((u) => {
      if (!u) return toast("Preview unavailable");
      view.replaceWith(h("img", { src: u, alt: f.name, style: "max-width:100%;max-height:260px;border-radius:8px" }));
    }));
    box.append(view);
  }
  return box;
}

function roomLabel(r) {
  if (!r) return "Everyone";
  if (r.startsWith("grp:")) return r.slice(4);
  const me = String(ROOM.state.name || "").replace(/[\s|]/g, "_");
  return r.slice(3).split("|").find((x) => x !== me) || r.slice(3);
}

function roomNew() {
  const L = ROOM.L; if (!L || L.form) return;
  const kind = h("select", { class: "field" }, h("option", { value: "dm", text: "Private" }), h("option", { value: "group", text: "Group" }));
  const target = h("input", { class: "field", maxlength: "32", placeholder: "Device or group name" });
  const done = () => { L.form.remove(); L.form = null; };
  const open = () => {
    const t = target.value.trim(); if (!t) return;
    done();
    inv("room.open", kind.value, t).then((s) => { if (s) { ROOM.state = s; roomRender(); } });
  };
  target.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); if (e.key === "Escape") done(); });
  const go = h("button", { class: "btn primary", text: "Open" }); go.addEventListener("click", open);
  const pick = h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" });
  const showPick = () => { pick.style.display = kind.value === "dm" && pick.childNodes.length ? "flex" : "none"; };
  kind.addEventListener("change", showPick);
  inv("room.users").then((list) => {
    for (const n of list || []) {
      const b = h("button", { class: "btn", text: n, title: "Chat with " + n });
      b.addEventListener("click", () => { target.value = n; open(); });
      pick.append(b);
    }
    showPick();
  });
  showPick();
  L.form = h("div", { style: "padding:0 12px 6px;display:flex;flex-direction:column;gap:6px" },
    h("div", { style: "color:var(--muted);font-size:12px", text: "Pick a user, or type a device or group name." }), pick,
    h("div", { style: "display:flex;gap:6px" }, kind, target, go));
  L.tabs.after(L.form);
  target.focus();
}

function roomRender() {
  const L = ROOM.L; if (!L) return;
  if (document.activeElement !== L.name && L.name.value !== (ROOM.state.name || "")) L.name.value = ROOM.state.name || "";
  clear(L.tabs);
  for (const r of ["", ...(ROOM.state.chats || [])]) {
    const b = h("button", { class: "btn" + (r === ROOM.state.room ? " primary" : ""), text: roomLabel(r) });
    b.addEventListener("click", () => inv("room.select", r).then((s) => { if (s) { ROOM.state = s; roomRender(); } }));
    if (r) b.addEventListener("contextmenu", (e) => { e.preventDefault(); inv("room.remove", r).then((s) => { if (s) { ROOM.state = s; roomRender(); } }); });
    L.tabs.append(b);
  }
  const add = h("button", { class: "btn", text: "+", title: "New private chat or group" });
  add.addEventListener("click", roomNew);
  L.tabs.append(add);
  L.note.textContent = ROOM.state.error || (ROOM.state.room ? "Anyone who knows this chat name can read it. Messages are not end-to-end encrypted and are kept 24 hours." : null) || "Everyone linked to this server is in this room. Messages are not end-to-end encrypted and are kept 24 hours.";
  const up = ROOM.state.upload;
  L.prog.style.display = up ? "" : "none";
  L.prog.textContent = up ? "Uploading " + up.name + " " + up.pct + "%" : "";
  const stick = L.thread.scrollTop + L.thread.clientHeight >= L.thread.scrollHeight - 40;
  clear(L.thread);
  for (const m of ROOM.state.messages) {
    const mine = m.name === ROOM.state.name;
    L.thread.append(h("div", { class: mine ? "aiq chat-q" : "prose chat-a" },
      mine ? "" : h("div", { style: "color:var(--amber);font-size:12px", text: m.name }), m.file ? roomFile(m.file) : m.text));
  }
  if (stick) L.thread.scrollTop = L.thread.scrollHeight;
}
