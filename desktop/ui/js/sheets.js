"use strict";
// Inbox, Reader, Remind, Video speed/quality, Closed tabs, Ask AI, AI memory, Link preview.
const INB = { L: null, tab: "mail" };
const refreshInbox = debounce(() => { if (INB.L && !INB.L.closed) renderInbox(); }, 40);

function openInbox() {
  INB.L = sheet({ title: "Inbox", key: "inbox", tall: true, onClose: () => { INB.L = null; },
    head: ib("reload", "Refresh", () => inv("relay.refresh")) }, () => {});
  inv("relay.state").then((st) => { if (st) S.relay = Object.assign({}, S.relay, st); renderInbox(); });
  inv("relay.refresh");
  renderInbox();
}
function renderInbox() {
  const b = INB.L.body, st = S.relay || {}, mails = st.mails || [], al = st.aliases || [];
  clear(b);
  const tab = (k, label) => h("button", { class: "chip" + (INB.tab === k ? " sel" : ""), act: () => { INB.tab = k; renderInbox(); } }, label);
  b.append(h("div", { class: "tabs2" }, tab("mail", "Inbox" + (mails.length ? " (" + mails.length + ")" : "")), tab("addr", "Addresses" + (al.length ? " (" + al.length + ")" : ""))));
  if (st.error) b.append(h("div", { class: "empty", style: "color:var(--coral);padding:12px", text: st.error }));
  if (INB.tab === "addr") {
    if (!al.length) return b.append(h("div", { class: "empty", text: "No addresses yet" }));
    for (const a of al) b.append(h("div", { class: "row" }, ico("email"),
      h("div", { class: "main" }, h("div", { class: "t1", text: a.address }), h("div", { class: "t2", text: (a.site || "") + (a.created ? " · " + fmtTime(a.created) : "") })),
      ib("copy", "Copy", () => { navigator.clipboard.writeText(a.address).catch(() => {}); toast("Address copied"); }),
      ib("delete", "Forget", async () => {
        if (!(await confirmDialog({ title: "Forget address?", message: a.address, ok: "Forget", danger: true }))) return;
        if (!(await inv("relay.forget", a.address))) toast("Couldn't delete");
        else inv("relay.state").then((s2) => { if (s2) { S.relay = Object.assign({}, S.relay, s2); refreshInbox(); } });
      })));
    return;
  }
  if (st.loading && !mails.length) return b.append(h("div", { class: "think" }, h("span", { class: "spin" }), "Loading…"));
  if (!mails.length) return b.append(h("div", { class: "empty", text: "No mail yet" }));
  for (const m of mails) {
    const links = (m.links || []).filter((l) => /^https?:\/\//i.test(l)).slice(0, 4);
    b.append(h("div", { class: "mail" },
      h("div", { class: "t1", text: m.subject || "(no subject)" }),
      h("div", { class: "t2", text: "From " + (m.from || "?") }),
      h("div", { class: "t2", text: "To " + (m.to || m.alias || "?") + (m.date ? " · " + fmtTime(m.date) : "") }),
      m.text ? h("div", { class: "body", text: m.text }) : null,
      h("div", { class: "acts" },
        links.map((l) => h("button", { class: "btn muted", title: l, act: () => { INB.L.close(); inv("tab.new", { url: l }); } }, ico("link"), " " + hostOf(l))),
        btn("Delete", async () => {
          if (!(await confirmDialog({ title: "Delete mail?", message: m.subject || "", ok: "Delete", danger: true }))) return;
          if (!(await inv("relay.delete", m.id))) toast("Couldn't delete");
        }, "muted"))));
  }
}

// Reader view with text-to-speech.
function openReader() {
  inv("reader").then((r) => {
    if (!r || !r.text) return toast("Page not ready");
    let speaking = false;
    const tts = h("button", { class: "btn muted", act: () => {
      if (speaking) { speechSynthesis.cancel(); return; }
      const u = new SpeechSynthesisUtterance((r.title ? r.title + ". " : "") + r.text);
      u.onend = u.onerror = () => { speaking = false; tts.textContent = "Read aloud"; };
      speechSynthesis.speak(u); speaking = true; tts.textContent = "Stop reading";
    } }, "Read aloud");
    sheet({ title: "Reader", key: "reader", tall: true, wide: true, head: tts,
      onClose: () => { if (speaking) speechSynthesis.cancel(); } }, (b) => {
      // Headings come as "## text", list items as "• text"; dir=auto keeps right-to-left text aligned right.
      b.append(h("div", { class: "prose" }, r.title ? h("h1", { text: r.title, dir: "auto" }) : null,
        r.text.split("\n\n").map(p => p.startsWith("## ") ? h("h2", { text: p.slice(3), dir: "auto" }) : h("p", { text: p, dir: "auto" }))));
    });
  });
}

// Pick-one sheet. items: [{label, value, sub}]
function optSheet(title, key, items, cur, pick) {
  return sheet({ title, key }, (b, L) => {
    b.append(h("div", { class: "opts", style: "margin:0" }, items.map((it) =>
      h("button", { class: "opt" + (it.value === cur ? " sel" : ""), act: () => { L.close(); pick(it.value); } },
        h("span", { class: "dot" }), h("span", { text: it.label })))));
  });
}
function openRemind() {
  const now = new Date(), at = (d, hh) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(hh, 0, 0, 0); return x.getTime(); };
  const set = async (ts) => { const r = await inv("remind.set", ts); if (r && r.text) toast(r.text); };
  const items = [{ label: "In 1 hour", value: "h" }, { label: "This evening (19:00)", value: "e" }, { label: "Tomorrow 9:00", value: "t" }, { label: "Pick date and time…", value: "p" }];
  optSheet("Remind me", "remind", items, null, async (v) => {
    if (v === "h") return set(Date.now() + 3600e3);
    if (v === "e") return set(at(0, 19));
    if (v === "t") return set(at(1, 9));
    const s = await dateTimeDialog();
    if (s) set(new Date(s).getTime());
  });
}
function dateTimeDialog() {
  const pad = (n) => String(n).padStart(2, "0"), d = new Date(Date.now() + 3600e3);
  const v = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":00";
  return dialog({ title: "Remind me", key: "dt" }, (box, L) => {
    const i = h("input", { class: "field", type: "datetime-local", value: v, autofocus: true });
    L.submit = () => L.close(i.value || null);
    box.append(i, btnRow(btn("Cancel", () => L.close(null), "muted"), btn("Set", () => L.submit())));
  });
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
function openVideoSpeed() {
  const cur = S.tab.speed || S.prefs.speed || 1;
  optSheet("Video speed", "speed", SPEEDS.map((v) => ({ label: v === 1 ? "Normal" : v + "x", value: v })), cur,
    (v) => inv("video.speed", v));
}
function openVideoQuality() {
  const host = S.tab.host || hostOf(S.tab.url), def = S.prefs.quality || 720;
  const cur = (S.prefs.qualities || {})[host] ?? null;
  const items = [{ label: "Default (" + def + "p)", value: null }].concat((S.qualities || []).map((q) => ({ label: q + "p", value: q })));
  optSheet("Video quality for " + (host || "this site"), "quality", items, cur, (v) => inv("video.quality", v));
}
async function openClosed() {
  const r = (await inv("tab.list")) || {};
  const closed = r.closed || [];
  sheet({ title: "Recently closed", key: "closed" }, (b, L) => {
    if (!closed.length) return b.append(h("div", { class: "empty", text: "Nothing closed recently" }));
    closed.forEach((t, i) => b.append(h("button", { class: "row", act: () => { L.close(); inv("tab.reopen", i); } },
      ico(t.private ? "private" : "globe"),
      h("div", { class: "main" }, h("div", { class: "t1", text: t.title || t.url || "New tab" }), h("div", { class: "t2", text: hostOf(t.url) })))));
  });
}

// Ask AI: question, answer, follow-up box.
function openAiAnswer(q, ctx) {
  if (!S.ai || !S.ai.connected) { toast({ text: "Ask AI isn't set up", actions: [{ label: "Settings", fn: () => openSettings("ai") }] }); return; }
  sheet({ title: "Ask AI", key: "ai", tall: true, wide: true }, (b, L) => {
    const thread = h("div", { style: "padding-top:4px" });
    const ta = h("textarea", { class: "field", rows: "1", placeholder: "Ask a follow-up", autofocus: !q });
    let last = "";
    const ask = async (text) => {
      text = (text || "").trim(); if (!text) return;
      const qEl = h("div", { class: "aiq", text });
      const out = h("div", { class: "think" }, h("span", { class: "spin" }), "Thinking…");
      thread.append(qEl, out); out.scrollIntoView({ block: "end" });
      const c = [ctx || "", last ? "Previous answer:\n" + last : ""].filter(Boolean).join("\n\n");
      const r = await inv("ai.ask", text, c);
      if (L.closed) return;
      if (!r || r.error || r.text == null) {
        out.replaceWith(h("div", { class: "think", style: "color:var(--coral)" }, (r && r.error) || "Request failed",
          btn("Retry", () => { qEl.remove(); retry.remove(); ask(text); }, "muted")));
        const retry = thread.lastChild; return;
      }
      last = r.text;
      out.replaceWith(h("div", { class: "prose", style: "padding-bottom:8px" }, r.text,
        h("div", { style: "margin-top:6px" }, ib("copy", "Copy", () => { navigator.clipboard.writeText(r.text).catch(() => {}); toast("Copied"); }))));
    };
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const v = ta.value; ta.value = ""; ask(v); } });
    L.sheet.append(h("div", { class: "ai-in" }, ta, ib("up", "Send", () => { const v = ta.value; ta.value = ""; ask(v); })));
    b.append(thread);
    if (q) ask(q);
  });
}
async function openAiMemory() {
  const facts = (await inv("ai.memory.get")) || [];
  sheet({ title: "Memory (" + facts.length + " facts)", key: "memory", wide: true }, (b, L) => {
    const ta = h("textarea", { class: "field mem", value: facts.join("\n"), placeholder: "Nothing remembered yet" });
    const save = async (text) => {
      const r = await inv("ai.memory.set", text);
      L.close(); toast(Array.isArray(r) ? "Saved " + r.length + " facts" : "Memory saved");
    };
    b.append(h("p", { style: "color:var(--muted);font-size:13px;padding:0 20px 10px", text: "One fact per line. Stored encrypted on this PC only." }), ta,
      h("div", { class: "btns", style: "padding:12px 20px 0;display:flex;gap:8px;justify-content:flex-end" },
        btn("Clear all", async () => { if (await confirmDialog({ title: "Clear all memory?", ok: "Clear", danger: true })) save(""); }, "muted danger"),
        btn("Save", () => save(ta.value))));
  });
}

// Link preview: main overlays a live view on the .pv-hole rect.
function openPreview(url) {
  let promoted = false;
  const L = openLayer({ key: "preview", onClose: () => { if (!promoted) inv("preview.close"); } }, (L) =>
    h("div", { class: "pv-frame" },
      h("div", { class: "sh-head" }, h("h2", { text: "Preview · " + hostOf(url) }),
        btn("Open in tab", () => { promoted = true; inv("preview.promote"); L.close(); }, "muted"),
        ib("close", "Close preview", () => L.close())),
      h("div", { class: "pv-hole" })));
  const hole = $(".pv-hole", L.el);
  let opened = false;
  function place() {
    if (L.closed) return;
    const r = hole.getBoundingClientRect();
    const rect = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    if (!opened) { opened = true; inv("preview.open", url, rect); }
  }
  setTimeout(place, 200); // after the window has switched to overlay layout and the fade-in settled
}
