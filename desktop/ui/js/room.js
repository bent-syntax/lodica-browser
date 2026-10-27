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
    const put = (t) => {
      const a = L.ta.selectionStart ?? L.ta.value.length, b = L.ta.selectionEnd ?? a;
      L.ta.value = L.ta.value.slice(0, a) + t + L.ta.value.slice(b);
      L.ta.focus(); L.ta.selectionStart = L.ta.selectionEnd = a + t.length;
    };
    L.pick = h("div", { style: "display:none;flex-wrap:wrap;gap:4px;padding:6px 12px;max-height:180px;overflow:auto" });
    const togglePick = async () => {
      if (L.pick.style.display !== "none") { L.pick.style.display = "none"; return; }
      clear(L.pick);
      for (const c of ROOM_EMOJI) {
        const b = h("button", { class: "ib", title: c, text: c, style: "font-size:calc(20px * var(--chat-scale, 1))" });
        b.addEventListener("click", () => put(c));
        L.pick.append(b);
      }
      const list = await inv("emojis.list") || [];
      ROOM.emojis = new Map(list.map((e) => [e.name, e.png]));
      for (const e of list) {
        const b = h("button", { class: "ib", title: ":" + e.name + ":" }, h("img", { src: "data:image/png;base64," + e.png, alt: e.name, style: "width:calc(24px * var(--chat-scale, 1));height:calc(24px * var(--chat-scale, 1))" }));
        b.addEventListener("click", () => put(":" + e.name + ":"));
        L.pick.prepend(b);
      }
      L.pick.style.display = "flex";
      roomRender();
    };
    return h("div", { class: "spage" },
      h("div", { class: "sp-main" },
        h("div", { class: "sp-head" }, h("h2", { text: "Server chat" }), ib("close", "Close chat", () => L.close())),
        L.tabs, L.note, L.thread, L.prog,
        L.pick,
        h("div", { class: "ai-in" }, L.name, L.ta, ib("clip", "Send a file (max 5 GB)", attach), ib("smile", "Emojis", togglePick), ib("up", "Send", send))));
  });
  inv("emojis.list").then((l) => { ROOM.emojis = new Map((l || []).map((e) => [e.name, e.png])); roomRender(); });
  inv("room.discover").then((s) => { if (s) { ROOM.state = s; roomRender(); } });
  inv("room.start").then((s) => { if (s) ROOM.state = s; ROOM.L && (ROOM.L.name.value = ROOM.state.name || ""); roomRender(); });
  return ROOM.L;
}

// An attachment: never opened or run, only previewed (verified images) or saved by the user.
const ROOM_PREVIEW = new Map();
function roomSave(f) {
  inv("room.save", f.id, f.name).then((ok) => { if (ok) toast("Saved"); else if (ok === false) toast("Download failed"); });
}
function roomFile(f) {
  if (/^image\//.test(f.type)) {
    const box = h("div", { style: "position:relative;display:inline-block;max-width:100%;min-width:96px;min-height:96px;border-radius:12px;overflow:hidden;background:var(--raised,#374151)" });
    const dl = h("button", { class: "ib", title: "Download " + f.name, "aria-label": "Download " + f.name, style: "position:absolute;top:8px;right:8px;background:rgba(17,24,39,.7);color:#fff;border-radius:12px", act: () => roomSave(f) }, ico("download"));
    const show = (u) => {
      const img = h("img", { src: u, alt: f.name, style: "display:block;max-width:100%;width:auto;height:auto;object-fit:contain;max-height:calc(260px * var(--chat-scale, 1))" });
      img.addEventListener("load", () => { box.style.minWidth = box.style.minHeight = ""; });
      box.prepend(img);
    };
    box.append(dl);
    if (ROOM_PREVIEW.has(f.id)) show(ROOM_PREVIEW.get(f.id));
    else inv("room.preview", f.id).then((u) => {
      if (!u) { box.prepend(h("div", { style: "padding:12px;font-size:13px", text: f.name })); return; }
      ROOM_PREVIEW.set(f.id, u); show(u);
    });
    return box;
  }
  const kb = f.size < 1024 * 1024 ? Math.max(1, Math.round(f.size / 1024)) + " KB" : (f.size / 1048576).toFixed(1) + " MB";
  return h("button", { class: "btn", text: "Save " + f.name + " (" + kb + ")", act: () => roomSave(f) });
}

const ROOM_EMOJI = [..."😀😃😄😁😆😅😂🤣😊😇🙂😉😍🥰😘😋😎🤩🥳😏😒😞😔😢😭😤😡🤯😱😨😰🤔🙄😴🤗🤭🫡👍👎👏🙌🙏💪👀🔥✨🎉💯❤️💔💙💚💛🧡💜🖤🤝👋✅❌⭐🚀"].reduce((a, c) => { if (c === "\ufe0f" || c === "\u200d") a[a.length - 1] += c; else a.push(c); return a; }, []);

// Text with :name: of a server emoji drawn as its image.
function roomText(t) {
  const map = ROOM.emojis; if (!map || !map.size) return t;
  const out = []; let at = 0;
  for (const m of t.matchAll(/:([a-z0-9_]{1,32}):/g)) {
    const png = map.get(m[1]); if (!png) continue;
    out.push(t.slice(at, m.index), h("img", { src: "data:image/png;base64," + png, alt: m[0], title: m[0], style: "width:calc(22px * var(--chat-scale, 1));height:calc(22px * var(--chat-scale, 1));vertical-align:middle" }));
    at = m.index + m[0].length;
  }
  out.push(t.slice(at));
  return h("span", {}, ...out);
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
  const scale = (S.prefs.chatScale || 100) / 100;
  L.thread.style.setProperty("--chat-scale", scale);
  L.pick.style.setProperty("--chat-scale", scale);
  L.ta.style.fontSize = Math.round(15 * scale) + "px";
  const sig = JSON.stringify([scale, ROOM.state.messages, ROOM.state.pending, ROOM.state.name, ROOM.state.room]);
  if (L.sig === sig) return;
  L.sig = sig;
  const stick = L.thread.scrollTop + L.thread.clientHeight >= L.thread.scrollHeight - 40;
  clear(L.thread);
  for (const m of ROOM.state.messages) {
    const mine = m.name === ROOM.state.name || (ROOM.state.names || []).includes(m.name);
    L.thread.append(h("div", { class: mine ? "aiq chat-q" : "prose chat-a" },
      mine ? "" : h("div", { style: "color:var(--amber);font-size:calc(12px * var(--chat-scale, 1))", text: m.name }), m.file ? roomFile(m.file) : roomText(m.text)));
  }
  for (const t of ROOM.state.pending || []) L.thread.append(h("div", { class: "aiq chat-q", style: "opacity:.55", title: "Waiting for the server" }, t, h("div", { style: "font-size:calc(11px * var(--chat-scale, 1))", text: "Waiting for the server…" })));
  if (stick) L.thread.scrollTop = L.thread.scrollHeight;
}
