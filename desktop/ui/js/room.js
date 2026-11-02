"use strict";
// Server chat: one shared room for everyone linked to the same server.
const ROOM = { L: null, state: { messages: [], error: null, name: "Me", room: "", chats: [] } };

function openRoom() {
  if (ROOM.L) return ROOM.L;
  ROOM.L = openLayer({ key: "room", cls: "spage-layer", dim: false, onClose: () => { ROOM.L = null; inv("room.stop"); } }, (L) => {
    L.tabs = h("div", { class: "chat-tabs", style: "display:flex;gap:6px;flex-wrap:wrap;padding:6px 12px" });
    L.who = h("div", { class: "chat-who" });
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
    L.el.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const d = e.key === "+" || e.key === "=" ? 1 : e.key === "-" ? -1 : 0; if (!d) return;
      e.preventDefault();
      const steps = [100, 125, 150, 200], i = Math.max(0, steps.indexOf(S.prefs.chatScale || 100));
      const n = steps[Math.min(steps.length - 1, Math.max(0, i + d))];
      if (n !== S.prefs.chatScale) setPref("chatScale", n);
    });
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
      if (list.length) ROOM.emojis = new Map(list.map((e) => [e.name, e.png]));
      for (const e of list) {
        const b = h("button", { class: "ib", title: ":" + e.name + ":" }, h("img", { src: "data:image/png;base64," + e.png, alt: e.name, style: "width:calc(36px * var(--chat-scale, 1));height:calc(36px * var(--chat-scale, 1))" }));
        b.addEventListener("click", () => put(":" + e.name + ":"));
        L.pick.prepend(b);
      }
      L.pick.style.display = "flex";
      roomRender();
    };
    return h("div", { class: "spage" },
      h("div", { class: "sp-main" },
        h("div", { class: "sp-head" }, h("h2", { text: "Server chat" }), ib("close", "Close chat", () => L.close())),
        L.tabs, L.who, L.note, L.thread, L.prog,
        L.pick,
        h("div", { class: "ai-in" }, L.name, L.ta, ib("clip", "Send a file (max 5 GB)", attach), ib("smile", "Emojis", togglePick), ib("up", "Send", send))));
  });
  // Fetch the server emojis on every open; an empty answer keeps what we have, and one retry covers a slow link.
  const syncEmojis = (retry) => inv("emojis.list").then((l) => {
    if (l && l.length) { ROOM.emojis = new Map(l.map((e) => [e.name, e.png])); roomRender(); }
    else if (retry) setTimeout(() => ROOM.L && syncEmojis(false), 3000);
  });
  syncEmojis(true);
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
    const box = h("div", { style: "position:relative;display:inline-block;max-width:100%;min-width:96px;min-height:96px;border-radius:12px;overflow:hidden;background:var(--raised,#374151)" + (f.w && f.h ? ";aspect-ratio:" + f.w + "/" + f.h + ";width:min(100%," + Math.round(f.w) + "px);max-height:calc(260px * var(--chat-scale, 1))" : "") });
    const dl = h("button", { class: "ib", title: "Download " + f.name, "aria-label": "Download " + f.name, style: "position:absolute;top:8px;right:8px;background:rgba(17,24,39,.7);color:#fff;border-radius:12px", act: () => roomSave(f) }, ico("download"));
    const show = (u) => {
      const img = h("img", { src: u, alt: f.name, style: "display:block;max-width:100%;width:" + (f.w && f.h ? "100%;height:100%" : "auto;height:auto") + ";object-fit:contain;max-height:calc(260px * var(--chat-scale, 1))" });
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
    out.push(t.slice(at, m.index), h("img", { src: "data:image/png;base64," + png, alt: m[0], title: m[0], style: "width:calc(32px * var(--chat-scale, 1) * var(--emoji-scale, 1));height:calc(32px * var(--chat-scale, 1) * var(--emoji-scale, 1));vertical-align:middle" }));
    at = m.index + m[0].length;
  }
  out.push(t.slice(at));
  return h("span", {}, ...out);
}

// Online list, Snapchat style: a character built from the device's OS and the username (the colour comes from the name, so it changes when the name changes), the username above, the device below.
const ROOM_OS = { android: ["🤖", "Android"], windows: ["🪟", "Windows"], macos: ["🍎", "Mac"], linux: ["🐧", "Linux"], ios: ["📱", "iPhone"], other: ["💻", "Device"] };
// Cartoon avatar drawn from the name alone, so it changes when the username changes. An AI-made character (u.face) replaces it.
function roomAvatar(name) {
  let n = 7; for (const c of name) n = (n * 31 + c.codePointAt(0)) >>> 0;
  const pick = (k, m) => Math.floor(n / k) % m;
  const bg = "hsl(" + (n % 360) + ",55%,45%)", shirt = "hsl(" + (Math.floor(n / 8) % 360) + ",60%,35%)";
  const skin = ["#F5D0B0", "#E8B58C", "#C68B5E", "#8D5A3B", "#FADDC4"][pick(3, 5)];
  const hair = ["#2B1B12", "#6B3E1E", "#D9A441", "#B33A2B", "#222", "#8A8A8A"][pick(5, 6)];
  const style = pick(11, 4);
  const hairSvg = [
    '<path d="M10 20c0-9 5-13 10-13s10 4 10 13c-3-5-6-6-10-6s-7 1-10 6z" fill="' + hair + '"/>',
    '<path d="M9 22c-1-10 4-15 11-15s12 5 11 15c-1-4-2-8-11-8S10 18 9 22z" fill="' + hair + '"/><rect x="8" y="18" width="4" height="12" rx="2" fill="' + hair + '"/><rect x="28" y="18" width="4" height="12" rx="2" fill="' + hair + '"/>',
    '<path d="M11 15c2-6 16-6 18 0-4-2-14-2-18 0z" fill="' + hair + '"/>',
    '<circle cx="20" cy="9" r="5" fill="' + hair + '"/><path d="M11 18c0-6 4-9 9-9s9 3 9 9c-3-3-6-4-9-4s-6 1-9 4z" fill="' + hair + '"/>',
  ][style];
  const mouth = ['<path d="M15 25q5 4 10 0" stroke="#5a2a1a" stroke-width="1.8" fill="none" stroke-linecap="round"/>', '<ellipse cx="20" cy="26" rx="3" ry="2.2" fill="#5a2a1a"/>', '<path d="M16 26h8" stroke="#5a2a1a" stroke-width="1.8" stroke-linecap="round"/>'][pick(13, 3)];
  const glasses = pick(17, 4) === 0 ? '<g fill="none" stroke="#222" stroke-width="1.4"><circle cx="15.5" cy="20" r="3.6"/><circle cx="24.5" cy="20" r="3.6"/><path d="M19 20h2"/></g>' : "";
  return '<svg viewBox="0 0 40 40" width="100%" height="100%"><rect width="40" height="40" fill="' + bg + '"/><ellipse cx="20" cy="42" rx="14" ry="10" fill="' + shirt + '"/><circle cx="20" cy="21" r="10" fill="' + skin + '"/>' + hairSvg +
    '<circle cx="15.5" cy="20" r="1.5" fill="#222"/><circle cx="24.5" cy="20" r="1.5" fill="#222"/>' + glasses + mouth + '</svg>';
}
function roomFace(u, cls) {
  const [g, label] = ROOM_OS[u.os] || ROOM_OS.other;
  const el = h("div", { class: cls, title: u.name + " (" + label + ")" });
  if (u.face) { el.style.background = "var(--raised)"; el.textContent = u.face; } else el.innerHTML = roomAvatar(u.name);
  return [el, label, g];
}
function roomPerson(u) {
  const [face, label, glyph] = roomFace(u, "chat-face");
  face.append(h("i", { class: "chat-dot" + (u.online ? " on" : "") }), h("b", { class: "chat-os", text: glyph }));
  return h("div", { class: "chat-person" + (u.online ? "" : " off"), title: u.name + (u.online ? " is online" : " was online recently") }, h("div", { class: "chat-pname", text: u.name }), face, h("div", { class: "chat-pos", text: u.me ? "You · " + label : label }));
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
  const myOs = (ROOM.state.online || []).find((u) => u.name === ROOM.state.name);
  const people = [...(myOs ? [] : [{ name: ROOM.state.name || "Me", os: ROOM.state.os || "other", face: ROOM.state.face || "", online: true }]).map((u) => ({ ...u, me: true })), ...(ROOM.state.online || []).map((u) => ({ ...u, me: u.name === ROOM.state.name }))].filter((u) => u.name && (u.online || u.me)).sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0) || (b.online ? 1 : 0) - (a.online ? 1 : 0));
  const wsig = JSON.stringify(people);
  if (L.wsig !== wsig) { L.wsig = wsig; clear(L.who); for (const u of people) L.who.append(roomPerson(u)); L.who.style.display = people.length ? "flex" : "none"; }
  const up = ROOM.state.upload;
  L.prog.style.display = up ? "" : "none";
  L.prog.textContent = up ? "Uploading " + up.name + " " + up.pct + "%" : "";
  const scale = (S.prefs.chatScale || 100) / 100;
  L.thread.style.setProperty("--chat-scale", scale);
  L.pick.style.setProperty("--chat-scale", scale);
  const emo = (S.prefs.chatEmojiScale || 150) / 100;
  L.thread.style.setProperty("--emoji-scale", emo);
  L.ta.style.fontSize = Math.round(15 * scale) + "px";
  const sig = JSON.stringify([scale, emo, ROOM.state.messages, ROOM.state.pending, ROOM.state.name, ROOM.state.room, ROOM.state.reads]);
  if (L.sig === sig) return;
  L.sig = sig;
  const stick = L.thread.scrollTop + L.thread.clientHeight >= L.thread.scrollHeight - 40;
  clear(L.thread);
  for (const m of ROOM.state.messages) {
    const mine = m.name === ROOM.state.name || (ROOM.state.names || []).includes(m.name);
    L.thread.append(h("div", { class: mine ? "aiq chat-q" : "prose chat-a" },
      mine ? "" : h("div", { style: "color:var(--amber);font-size:calc(12px * var(--chat-scale, 1))", text: m.name }), m.file ? roomFile(m.file) : roomText(m.text)));
    // Small device icons under the message each other device has read up to.
    const nextId = (ROOM.state.messages[ROOM.state.messages.indexOf(m) + 1] || { id: Infinity }).id;
    const here = Object.keys(ROOM.state.reads || {}).filter((n) => n !== ROOM.state.name && !(ROOM.state.names || []).includes(n) && ROOM.state.reads[n] >= m.id && ROOM.state.reads[n] < nextId);
    if (here.length) {
      const row = h("div", { class: "chat-seen" });
      for (const n of here) { const u = (ROOM.state.online || []).find((x) => x.name === n) || { name: n, os: "other" }; row.append(roomFace(u, "chat-mini")[0]); }
      row.append(h("span", { class: "chat-seen-t", text: "Seen by " + here.join(", ") }));
      L.thread.append(row);
    }
  }
  for (const t of ROOM.state.pending || []) L.thread.append(h("div", { class: "aiq chat-q", style: "opacity:.55", title: "Waiting for the server" }, t, h("div", { style: "font-size:calc(11px * var(--chat-scale, 1))", text: "Waiting for the server…" })));
  if (stick) L.thread.scrollTop = L.thread.scrollHeight;
}
