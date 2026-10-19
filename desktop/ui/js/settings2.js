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
  for (const x of SET.exts || []) out.push(setRow(x.name, x.version ? "Version " + x.version : null, toggleEl(x.on),
    async () => { SET.exts = await inv("ext.toggle", x.id); refreshSettings(); }));
  for (const x of SET.exts || []) out.push(setRow("Remove " + x.name, null, null, async () => { SET.exts = await inv("ext.remove", x.id); refreshSettings(); }));
  return out;
}
// 9. Privacy
function secPrivacy() {
  return [secHead("Privacy"),
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
    h("div", { class: "about" }, kite(40),
      h("div", null, h("div", { class: "t1", text: "Lodica " + (S.version || "") }),
        h("div", { class: "t2", text: "Engine Chromium " + (S.chromium || "") }),
        S.ghostery ? h("div", { class: "t2", text: "Ghostery " + S.ghostery }) : null)),
    updateRow(),
    setRow("What's new", "Patch notes for every version", null, openNotes)];
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
    case "available": return setRow("Update " + u.version + " available", (u.notes ? u.notes.split("\n")[0] + " · " : "") + mb(u.size) + " · tap to download", null, () => inv("update.download"));
    case "downloading": return setRow("Downloading " + (u.version || ""), (u.size ? Math.round(100 * (u.received || 0) / u.size) + "% · " : "") + mb(u.received) + " · tap to cancel", null, () => inv("update.cancel"));
    case "ready": return setRow("Update ready", u.path ? "Checksum verified. Tap to install" : "", null, () => inv("update.install"));
    case "error": return setRow("Check for updates", u.message + " · tap to retry", null, () => inv("update.check"), "danger-row");
    default: return setRow("Check for updates", "Look for a newer Lodica", null, () => inv("update.check"));
  }
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
