"use strict";
// History, Downloads and Passwords sheets.
const DL = { L: null };

function openHistory() {
  return sheet({ title: "History", key: "history", tall: true }, (b, L) => {
    const list = h("div");
    let seq = 0;
    const load = async (q) => {
      const my = ++seq;
      const rows = (await inv("history.list", q || "")) || [];
      if (my !== seq) return;
      clear(list);
      if (!rows.length) { list.append(h("div", { class: "empty", text: q ? "No matches" : "No history yet" })); return; }
      let day = "";
      for (const r of rows) {
        const d = new Date(r.time || 0).toDateString();
        if (d !== day) { day = d; list.append(h("div", { class: "set-sec", text: dayLabel(r.time) })); }
        list.append(h("div", { class: "row click", act: () => { L.close(); inv("go", r.url); } },
          ico("globe"),
          h("div", { class: "main" }, h("div", { class: "t1", text: r.title || r.url }), h("div", { class: "t2", text: hostOf(r.url) })),
          h("span", { class: "side", text: Date.now() - (r.time || 0) < 6e4 ? "Just now" : new Date(r.time || 0).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }),
          ib("close", "Remove", async () => { await inv("history.delete", r.url); load(input.value); })));
      }
    };
    const input = h("input", { class: "search-in", type: "search", placeholder: "Search history", autofocus: true,
      on: { input: debounce((e) => load(e.target.value), 150) } });
    add(b, [input, list]);
    load("");
  });
}
function dayLabel(t) {
  const d = new Date(t || 0), now = new Date();
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

function openDownloads() {
  DL.L = sheet({ title: "Downloads", key: "downloads", tall: true, onClose: () => { DL.L = null; },
    head: btn("Clear", () => inv("downloads.clear").then(refreshDownloads), "muted") }, () => {});
  refreshDownloads();
  return DL.L;
}
async function refreshDownloads(list) {
  if (!DL.L) return;
  const rows = list || (await inv("downloads.list")) || [];
  if (!DL.L) return;
  const b = clear(DL.L.body);
  if (!rows.length) { b.append(h("div", { class: "empty", text: "No downloads" })); return; }
  for (const d of rows) {
    const run = d.state === "progressing", done = d.state === "completed";
    const pct = d.total ? Math.min(100, Math.round(100 * d.received / d.total)) : 0;
    const sub = run ? fmtBytes(d.received) + (d.total ? " / " + fmtBytes(d.total) : "") + (d.paused ? " · Paused" : "")
      : done ? fmtBytes(d.total || d.received) + " · " + hostOf(d.url)
      : d.state === "cancelled" ? "Cancelled" : "Failed";
    b.append(h("div", { class: "row" + (done ? " click" : ""), act: done ? () => inv("downloads.open", d.id) : null },
      ico(done ? "download" : run ? "download" : "warning"),
      h("div", { class: "main" }, h("div", { class: "t1", text: d.name }), h("div", { class: "t2", text: sub }),
        run ? h("div", { class: "dl-prog" }, h("i", { style: "width:" + pct + "%" })) : null),
      done ? ib("folder", "Show in folder", () => inv("downloads.show", d.id)) : null,
      run ? ib(d.paused ? "play" : "pause", d.paused ? "Resume" : "Pause", () => inv(d.paused ? "downloads.resume" : "downloads.pause", d.id)) : null,
      run ? ib("close", "Stop", () => inv("downloads.cancel", d.id)) : null,
      !run && !done ? ib("reload", "Retry", () => inv("downloads.resume", d.id)) : null,
      !run ? ib("delete", "Remove", () => inv("downloads.remove", d.id).then(() => refreshDownloads())) : null));
  }
}

// Passwords: PIN gate (set or unlock), then list.
async function openPasswords() {
  const st = (await inv("vault.state")) || {};
  if (!st.pinSet) {
    const pin = await pinDialog({ title: "Set a PIN", message: "Protects saved passwords on this PC.", confirm: true });
    if (pin == null) return;
    await inv("vault.setPin", pin);
  } else if (!st.unlocked) {
    const pin = await pinDialog({ title: "Passwords are locked", message: "Enter your PIN" });
    if (pin == null) return;
    if (!(await inv("vault.unlock", pin))) { toast("Wrong PIN"); return; }
  }
  return sheet({ title: "Passwords", key: "passwords", tall: true }, (b, L) => {
    const load = async () => {
      const rows = (await inv("vault.list")) || [];
      clear(b);
      const foot = () => { if (typeof openAuthenticator === "function") b.append(h("button", { class: "row totp-foot", act: () => openAuthenticator() }, ico("key"),
        h("div", { class: "main" }, h("div", { class: "t1", text: "Authenticator codes" }), h("div", { class: "t2", text: "One-time codes for sites with two-step sign-in" })), ico("chevron", "chev"))); };
      if (!rows.length) { b.append(h("div", { class: "empty", text: "No saved passwords" })); foot(); return; }
      for (const r of rows) b.append(h("div", { class: "row" }, ico("key"),
        h("div", { class: "main" }, h("div", { class: "t1", text: hostOf(r.origin) || r.origin }), h("div", { class: "t2", text: r.user || "" })),
        ib("copy", "Copy password", async () => { await inv("vault.copy", r.origin, r.user); toast("Password copied"); }),
        ib("delete", "Delete", async () => {
          if (!(await confirmDialog({ title: "Delete password?", message: (r.user || "") + " · " + r.origin, ok: "Delete", danger: true }))) return;
          await inv("vault.delete", r.origin, r.user); load();
        })));
      foot();
    };
    load();
  });
}
