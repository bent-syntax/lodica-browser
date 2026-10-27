"use strict";
// Settings sections 6-10: Data use, AI, Web apps, Privacy, About.

// 6. Data use
function secData() {
  const out = [secHead("Data use", "data")];
  if (SET.meter == null) { SET.meter = false; inv("meter.list").then((m) => { SET.meter = m || { hosts: [], totals: {} }; refreshSettings(); }); }
  const m = SET.meter;
  if (!m) return out.concat(setRow("Loading…", null));
  const t = m.totals || {};
  if (!(m.hosts || []).length) return out.concat(setRow("Nothing measured yet", null));
  out.push(h("div", { class: "stat" },
    h("div", null, h("div", { class: "n", text: fmtNum(t.blocked) }), h("div", { class: "l", text: "Blocked" })),
    h("div", null, h("div", { class: "n", text: fmtBytes(t.saved) }), h("div", { class: "l", text: "Total" }))));
  out.push(setRow("Per site", null, ico("chevron", "chev"), () => openMeter()));
  out.push(setRow("Reset data counters", null, null, async () => {
    await inv("meter.reset"); SET.meter = null; refreshSettings();
  }));
  return out;
}
// 7. AI
function secAi() {
  const ai = S.ai || {};
  const st = h("span", { class: "val", text: "Status: " + (ai.status || "off"), style: "color:var(" + (ai.connected ? "--mist" : "--amber") + ")" });
  const out = [secHead("AI"), setToggle("ai", "Ask AI", "Answers from Claude about the page or your question"),
    setRow("Status", null, st),
    setRow("Setup steps", null, ico("open", "chev"), () => inv("openExternal", "https://docs.anthropic.com/en/docs/claude-code/setup")),
    setRow("API key", ai.hasKey ? "Saved" : "Not set", ico("key", "chev"), () => askAiKey())];
  if (!S.prefs.ai) return out;
  out.push(setToggle("aiAlways", "Always generate AI answers", "Off: search shows a button and only asks Claude when you click it"));
  out.push(setRow("AI chat", "Chat with Claude, saved here and on your phone", ico("chevron", "chev"), () => openAiChat()));
  out.push(setRow("AI chat location", S.prefs.aiChatDir || "Default (app data folder). Click to choose a folder; click again to pick another.", ico("chevron", "chev"), async () => {
    let reset = false;
    if (S.prefs.aiChatDir) {
      const a = await confirmDialog({ title: "AI chat location", message: "Chats are saved in " + S.prefs.aiChatDir, ok: "Choose folder", extra: "Use default" });
      if (!a) return;
      reset = a === "extra";
    }
    const r = await inv("ai.chat.pickDir", reset);
    if (r == null) return;
    S.prefs.aiChatDir = r; toast("AI chats saved " + (r ? "in " + r : "in the default folder")); refreshSettings();
  }));
  out.push(setRow("Memory", null, ico("chevron", "chev"), () => openAiMemory()));
  if (SET.usage == null) { SET.usage = false; inv("ai.usage").then((u) => { SET.usage = u || {}; refreshSettings(); }); }
  const u = SET.usage;
  if (u) {
    const row = (l, x) => [h("span", { text: l }), h("span", { text: fmtNum((x || {}).r) }), h("span", { text: fmtNum((x || {}).i) }), h("span", { text: fmtNum((x || {}).o) })];
    out.push(h("div", { class: "usage" },
      h("span", { class: "h" }), h("span", { class: "h", text: "Requests" }), h("span", { class: "h", text: "In" }), h("span", { class: "h", text: "Out" }),
      row("Today", u.today), row("Last 30 days", u.month), row("All time", u.all)));
    out.push(setRow("Reset usage", null, null, async () => { await inv("ai.resetUsage"); SET.usage = null; refreshSettings(); }));
  }
  return out;
}
async function askAiKey() {
  const v = await textDialog({ title: "API key", message: "Stored encrypted on this PC only.", placeholder: "sk-ant-…", secret: true, ok: "Save" });
  if (v == null) return;
  const st = await inv("ai.setKey", v.trim());
  if (st && typeof st === "object") S.ai = Object.assign({}, S.ai, st);
  refreshSettings();
}
// 8. Web apps
function secApps() {
  const out = [secHead("Web apps", "apps")];
  if (SET.apps == null) { SET.apps = false; inv("webapps.list").then((a) => { SET.apps = a || []; refreshSettings(); }); }
  const a = SET.apps;
  if (!a) return out;
  if (!a.length) return out.concat(setRow("No apps installed", "Use “Install as app” from the menu"));
  for (const x of a) out.push(h("div", { class: "set-row" },
    ico("apps"), h("div", { class: "main" }, h("div", { class: "t1", text: x.name }), h("div", { class: "t2", text: hostOf(x.url) })),
    ib("open", "Open", () => inv("webapps.open", x.id)),
    ib("delete", "Delete", async () => { await inv("webapps.remove", x.id); SET.apps = null; refreshSettings(); })));
  return out;
}
// Chrome extensions (Chrome Web Store)
function secExtensions() {
  const out = [secHead("Extensions", "extensions")];
  if (SET.exts == null) { SET.exts = false; inv("ext.list").then((a) => { SET.exts = a || []; refreshSettings(); }); }
  out.push(setRow("Add from the Chrome Web Store", "Paste a store link or extension ID, then press Enter. Simple extensions work best; some Chrome features are not available here.",
    h("input", { class: "set-input", type: "text", placeholder: "Web Store link or ID", on: { keydown: async (e) => {
      if (e.key !== "Enter" || !e.target.value.trim()) return;
      const box = e.target; box.disabled = true;
      const r = await inv("ext.install", box.value.trim());
      if (r && r.ok) { SET.exts = r.list; toast("Extension installed"); } else toast((r && r.error) || "Install failed");
      refreshSettings();
    } } })));
  const local = (kind) => async () => {
    const r = await inv("ext.local", kind);
    if (r && r.ok) { SET.exts = r.list; toast("Extension installed"); } else if (r && !r.canceled) toast((r && r.error) || "Install failed");
    refreshSettings();
  };
  out.push(setRow("Install from a file", "A .crx, .zip or Firefox .xpi file. You see its permissions first. Only extensions that use Chrome-compatible features load.", null, local("file")));
  out.push(setRow("Load an unpacked folder", "A folder with a manifest.json, for extensions you are making. It is copied in; install again after changes.", null, local("folder")));
  for (const x of SET.exts || []) out.push(setRow(x.name, x.version ? "Version " + x.version : null, toggleEl(x.on),
    async () => { SET.exts = await inv("ext.toggle", x.id); refreshSettings(); }));
  for (const x of SET.exts || []) out.push(setRow("Remove " + x.name, null, null, async () => { SET.exts = await inv("ext.remove", x.id); refreshSettings(); }));
  return out;
}
// 9. Privacy
function secPrivacy() {
  const n = (S.tab && S.tab.blocked) || 0, on = !!S.prefs.httpsOnly;
  return [h("div", { class: "set-hero" + (on ? " on" : "") }, h("span", { class: "hero-ico" }, ico("shield")),
      h("div", { class: "main" }, h("div", { class: "t1", text: on ? "Protection is on" : "Protection is partly off" }),
        h("div", { class: "t2", text: n + " blocked on this page" + (on ? ". HTTPS-only is active" : ". HTTPS-only is off") }))),
    secHead("Privacy"),
    setRow("History", null, ico("chevron", "chev"), () => openHistory()),
    setRow("Passwords", null, ico("chevron", "chev"), () => openPasswords()),
    setRow("Clear history", null, null, async () => {
      if (await confirmDialog({ title: "Clear history?", message: "Every visited page is removed from this device.", ok: "Clear" })) inv("history.clear");
    }),
    setRow("Reset site permissions", null, null, async () => { await inv("privacy.resetPermissions"); toast("Site permissions reset"); }),
    setRow("Clear site data", null, null, async () => {
      const ok = await confirmDialog({ title: "Clear site data?", message: "Cookies, cache and storage for all sites. You will be logged out everywhere.", ok: "Clear", danger: true });
      if (!ok) return;
      await inv("privacy.clearSiteData"); toast("Site data cleared");
    }, "danger-row")];
}
// 10. About
function secAbout() {
  return [secHead("About"),
    h("div", { class: "about" }, aboutLogo(),
      h("div", null, h("div", { class: "t1", text: "Lodica " + (S.version || "") }),
        h("div", { class: "t2", text: "Engine Chromium " + (S.chromium || "") }),
        S.ghostery ? h("div", { class: "t2", text: "Ghostery " + S.ghostery }) : null)),
    updateRow(),
    setRow("Contact support", "Report a bug or ask for a feature. You get a notification when it is sent and when there is news", null, openSupport),
    setRow("Go back to an older version", "Pick a previous release if an update causes problems", null, openVersions),
    S.prefs.betaUnlocked ? setToggle("betaEnabled", "Beta tester", "Get new features early from pre-releases. They may be unstable") : null,
    setRow("What's new", "Patch notes for every version", null, openNotes)];
}
// Seven quick clicks on the logo unlock Beta tester mode.
let logoTaps = 0;
function aboutLogo() {
  const k = kite(40);
  k.addEventListener("click", () => {
    if (S.prefs.betaUnlocked || ++logoTaps < 7) return;
    S.prefs.betaUnlocked = true; S.prefs.betaEnabled = true;
    inv("prefs.set", "betaUnlocked", true); inv("prefs.set", "betaEnabled", true);
    inv("update.check"); toast("Beta tester mode unlocked"); refreshSettings();
  });
  return k;
}
// Patch notes sheet: the bundled PATCH_NOTES.md, one block per version.
function openNotes() {
  return sheet({ title: "What's new", key: "notes", tall: true }, async (b) => {
    const md = String((await inv("notes.get")) || "");
    if (!md.trim()) { b.append(h("div", { class: "empty", text: "No patch notes found" })); return; }
    for (const part of md.split(/^## /m).slice(1)) {
      const lines = part.split("\n");
      const items = lines.slice(1).map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
      b.append(h("div", { class: "row" }, h("div", { class: "main" },
        h("div", { class: "t1", text: lines[0].trim() }),
        ...items.map((t) => h("div", { class: "t2", text: "• " + t })))));
    }
  });
}
// Check for updates: the app reads the public GitHub release, downloads and verifies the build.
function updateRow() {
  if (!SET.updSub) {
    SET.updSub = true;
    window.lodica.on("update", (u) => { SET.upd = u; refreshSettings(); });
    inv("update.status").then((u) => { SET.upd = u; refreshSettings(); });
  }
  const u = SET.upd || { state: "idle" };
  const mb = (n) => (n ? (n / 1048576).toFixed(1) + " MB" : "");
  switch (u.state) {
    case "checking": return setRow("Check for updates", "Checking...", null);
    case "latest": return setRow("Check for updates", "Up to date (" + u.version + ")", null, () => inv("update.check"));
    case "available": if (u.older) return setRow("Go back to " + u.version, mb(u.size) + " · tap to download this older version", null, () => inv("update.download"));
      return setRow("Update " + u.version + " available", (u.notes ? u.notes.split("\n")[0] + " · " : "") + mb(u.size) + " · tap to download", null, () => inv("update.download"));
    case "downloading": return setRow("Downloading " + (u.version || ""), (u.size ? Math.round(100 * (u.received || 0) / u.size) + "% · " : "") + mb(u.received) + " · tap to cancel", null, () => inv("update.cancel"));
    case "ready": return setRow("Update ready", u.path ? "Checksum verified. Tap to install" : "", null, () => inv("update.install"));
    case "error": return setRow("Check for updates", u.message + " · tap to retry", null, () => inv("update.check"), "danger-row");
    default: return setRow("Check for updates", "Look for a newer Lodica", null, () => inv("update.check"));
  }
}
// Shrinks a picked image to a JPEG data (longest side 1280 px) for the support relay.
async function shrink(f) {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    for (let q = 0.85; q > 0.2; q -= 0.15) { const d = c.toDataURL("image/jpeg", q); if (d.length < 900000) return d.split(",")[1]; }
  } catch {}
  return null;
}
// Support: one open conversation with the team; answers and questions also arrive as notifications.
function openSupport() {
  return sheet({ title: "Contact support", key: "support", tall: true }, async (b, L) => {
    const draw = (st) => {
      b.textContent = "";
      const ta = h("textarea", { class: "field sup-ta", rows: "3", maxlength: "4000", placeholder: st.open ? "Write a reply..." : "What went wrong, or what would you like added?" });
      const err = h("div", { class: "sup-err", text: "" });
      const wrap = h("div", { class: "sup" });
      // contact needs a linked email first, so answers can always reach the user
      if (!st.email) {
        wrap.append(h("div", { class: "sup-intro" },
          h("div", { class: "sup-h", text: "How can we help?" }),
          h("div", { class: "t2", text: "Link your email first. Then you can report a bug or ask for a feature." })), linkBox(st));
        b.append(wrap);
        return;
      }
      if (!st.open) wrap.append(h("div", { class: "sup-intro" },
        h("div", { class: "sup-h", text: "How can we help?" }),
        h("div", { class: "t2", text: "Report a bug or ask for a feature. You get a notification when it is sent and when there is news." })));
      if (st.open) {
        const steps = ["Sent", "Reviewing", "Asking", "Fixing", "Confirming", "Done"];
        const at = { new: 0, seen: 1, "needs-info": 2, fixing: 3, "awaiting-confirm": 4, done: 5, closed: 5 }[st.status] ?? 0;
        wrap.append(h("div", { class: "sup-steps" }, steps.map((x, i) => h("span", { class: "sup-step" + (i < at ? " past" : i === at ? " now" : ""), text: x }))));
        const log = h("div", { class: "sup-log" });
        for (const m of st.messages) log.append(h("div", { class: "sup-msg" + (m.fromUser ? " me" : "") },
          h("div", { class: "sup-who", text: m.fromUser ? "You" : "Support" }),
          h("div", { class: "sup-txt", text: m.text + (m.images ? " [" + m.images + " image" + (m.images > 1 ? "s" : "") + "]" : "") })));
        wrap.append(log);
        const note = { "needs-info": "Support needs more information. Reply below.", fixing: "A fix is being built and tested.", "awaiting-confirm": "Is it fixed or working now?", done: "Fixed. Update the browser to get it." }[st.status];
        if (note) wrap.append(h("div", { class: "sup-note", text: note }));
      }
      const pics = [];
      const file = h("input", { type: "file", accept: "image/*", multiple: "", hidden: "" });
      const addBtn = h("button", { class: "btn sup-ghost", text: "Add image", act: () => file.click() });
      file.onchange = async () => {
        for (const f of file.files) if (pics.length < 3) { const d = await shrink(f); if (d) pics.push(d); }
        file.value = ""; addBtn.textContent = pics.length ? "Images: " + pics.length + "/3" : "Add image";
      };
      if (st.open && st.status === "awaiting-confirm") wrap.append(h("div", { class: "sup-row" },
        h("button", { class: "btn", text: "Yes, fixed", act: async () => draw(await inv("support.send", "Yes, it is fixed.", { resolved: true })) }),
        h("button", { class: "btn sup-ghost", text: "No", act: () => { ta.value = "No, it is still not fixed: "; ta.focus(); } })));
      const btn = h("button", { class: "btn", text: "Send", act: async () => {
        const text = ta.value.trim(); if (!text) return;
        btn.disabled = true; btn.textContent = "Sending...";
        const r = await inv("support.send", text, { images: pics });
        if (r && r.error) { btn.disabled = false; btn.textContent = "Send"; err.textContent = r.error; } else draw(r);
      } });
      wrap.append(ta, h("div", { class: "sup-row" }, addBtn, file, btn), err);
      wrap.append(linkBox(st));
      b.append(wrap);
    };
    // Email updates: link an address with a code sent to it. Then mail to support from it also works.
    const linkBox = (st) => {
      const box = h("div", { class: "sup-intro" }, h("div", { class: "sup-h", text: "Email updates" }));
      const lerr = h("div", { class: "sup-err", text: "" });
      if (st.email) {
        box.append(h("div", { class: "t2", text: "Linked to " + st.email + ". You get updates by email, and you can mail lodica@syntaxya.be from this address." }),
          h("div", { class: "sup-row" }, h("button", { class: "btn sup-ghost", text: "Unlink", act: async () => draw(await inv("support.unlink")) })));
        return box;
      }
      const em = h("input", { class: "field", type: "email", maxlength: "120", placeholder: "you@example.com" });
      const code = h("input", { class: "field", inputmode: "numeric", maxlength: "6", placeholder: "6-digit code", hidden: "" });
      const go = h("button", { class: "btn", text: "Send code", act: async () => {
        lerr.textContent = ""; go.disabled = true;
        if (code.hidden) {
          const r = await inv("support.linkStart", em.value);
          go.disabled = false;
          if (r && r.error) { lerr.textContent = r.error; return; }
          code.hidden = false; em.disabled = true; go.textContent = "Link"; lerr.textContent = "Code sent. Check your mail."; code.focus();
        } else {
          const r = await inv("support.linkVerify", em.value, code.value);
          go.disabled = false;
          if (r && r.error) { lerr.textContent = r.error; return; }
          draw(r);
        }
      } });
      box.append(h("div", { class: "t2", text: "We send a code to your email to check it is yours. You get updates by mail, and you can also mail lodica@syntaxya.be from it." }),
        em, code, h("div", { class: "sup-row" }, go), lerr);
      return box;
    };
    draw((await inv("support.open")) || { messages: [] });
  });
}
// Rollback: pick an older release from the list. The usual checksum check still applies.
function openVersions() {
  return sheet({ title: "Older versions", key: "versions", tall: true }, async (b, L) => {
    const list = (await inv("update.versions")) || [];
    if (!list.length) { b.append(h("div", { class: "empty", text: "No versions found. Check your connection." })); return; }
    for (const v of list) b.append(setRow(v.name + (v.current ? " (installed)" : ""), (v.date || "").slice(0, 10), null, v.current ? null : async () => {
      await inv("update.pick", v.tag); L.close();
    }));
  });
}
// Data meter detail sheet.
function openMeter() {
  return sheet({ title: "Data use", key: "meter", tall: true }, async (b) => {
    const m = (await inv("meter.list")) || { hosts: [] };
    const max = Math.max(1, ...(m.hosts || []).map((x) => x.saved || 0));
    if (!(m.hosts || []).length) { b.append(h("div", { class: "empty", text: "Nothing measured yet" })); return; }
    for (const x of m.hosts) b.append(h("div", { class: "row" },
      h("div", { class: "main" }, h("div", { class: "t1", text: x.host }),
        h("div", { class: "t2", text: fmtNum(x.blocked) + " blocked · " + fmtBytes(x.saved) }),
        h("div", { class: "bar-meter" }, h("i", { style: "width:" + Math.round(100 * (x.saved || 0) / max) + "%" })))));
  });
}
