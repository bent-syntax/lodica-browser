"use strict";
// Settings sheet: framework and sections 1-5 (Search, Browsing, VPS, Tabs on PC, Tabs).
const SET = { tab: "general", keys: null, cap: null, capture: null, L: null, pcLink: null, pcRemote: null, pcSub: false, apps: null, meter: null, usage: null };

function openSettings(section) {
  if (SET.L) return SET.L;
  SET.L = openLayer({ key: "settings", cls: "spage-layer", dim: false, onClose: () => { SET.L = null; } }, (L) => {
    L.side = h("nav", { class: "sp-side", role: "tablist" });
    L.body = h("div", { class: "sp-body" });
    return h("div", { class: "spage" }, L.side,
      h("div", { class: "sp-main" },
        h("div", { class: "sp-head" }, h("h2", { id: "sp-title" }), ib("close", "Close settings", () => L.close())),
        L.body));
  });
  if (section && SET_SECTION_TAB[section]) SET.tab = SET_SECTION_TAB[section];
  renderSettings();
  if (section) setTimeout(() => { const el = SET.L && SET.L.body.querySelector('[data-sec="' + section + '"]'); if (el) el.scrollIntoView(); }, 50);
  return SET.L;
}
const refreshSettings = debounce(() => { if (SET.L) renderSettings(); }, 50);

function renderSettings() {
  const b = SET.L.body, top = b.scrollTop;
  clear(b); clear(SET.L.side);
  add(SET.L.side, [setTabBar()]);
  $("#sp-title", SET.L.el).textContent = (SET_TABS.find((t) => t[0] === SET.tab) || SET_TABS[0])[1];
  add(b, [h("div", { class: "set-pane" }, setTabBody(SET.tab))]);
  b.scrollTop = top;
}
function secHead(name, id) { return h("div", { class: "set-sec", text: name, data: { sec: id || name.toLowerCase() } }); }
function setRow(title, sub, side, act, cls) {
  return h(act ? "button" : "div", { class: "set-row" + (act ? " click" : "") + (cls ? " " + cls : ""), act },
    h("div", { class: "main" }, h("div", { class: "t1", text: title }), sub ? h("div", { class: "t2", text: sub }) : null),
    side == null ? null : typeof side === "string" ? h("span", { class: "val", text: side }) : side);
}
function setToggle(key, title, sub) {
  const on = !!S.prefs[key];
  return setRow(title, sub, toggleEl(on), () => setPref(key, !on));
}
function setPref(key, v) { S.prefs[key] = v; inv("prefs.set", key, v); refreshSettings(); }
function setSelect(title, sub, src, key, conv) {
  const cur = S.prefs[key];
  const sel = h("select", { on: { change: (e) => setPref(key, conv ? conv(e.target.value) : e.target.value) } },
    optList(src).map((o) => h("option", { value: o.key, text: o.label, selected: String(o.key) === String(cur) })));
  return setRow(title, sub, sel);
}
function chips(items, cur, pick) {
  return h("div", { class: "chips" }, items.map((o) =>
    h("button", { class: "chip" + (String(o.key) === String(cur) ? " sel" : ""), act: () => pick(o.key), text: o.label })));
}

// 1. Search
function secSearch() {
  return [secHead("Search"), chips(optList(S.engines), S.prefs.search || "DUCKDUCKGO", (k) => setPref("search", k))];
}
// 2. Browsing
function secBrowsing() {
  const qs = (S.qualities || []).map((q) => ({ key: q, label: q + "p" }));
  return [secHead("Browsing"),
    setToggle("darkPages", "Dark pages", "Darken light sites that have no dark mode of their own"),
    setToggle("httpsOnly", "HTTPS-only", "Upgrade every connection, warn on plain HTTP"),
    setToggle("desktopDefault", "Desktop sites", "Request desktop pages in new tabs"),
    setRow("Dummy mail hidden sites", (S.prefs.noDummy || []).length ? S.prefs.noDummy.join(", ") : "None. The button shows on sign-up pages",
      (S.prefs.noDummy || []).length ? "Clear" : null, (S.prefs.noDummy || []).length ? () => setPref("noDummy", []) : null),
    setSelect("Video quality", "YouTube default. Change per site from the site menu", qs, "quality", Number)];
}
// 3. VPS
function secVps() {
  if (!S.relayAvail) return [secHead("VPS"), setRow("Not configured in this build", null)];
  return [secHead("VPS"),
    setToggle("routeVps", "Route through VPS", "Send browsing through tunnel.example.com. Logins and payments stay direct"),
    setRow("Inbox", null, ico("chevron", "chev"), () => openInbox())];
}
// 4. Tabs on PC
function secPcTabs() {
  const on = !!S.prefs.pcTabs;
  const out = [secHead("Tabs on PC", "pctabs"),
    setRow("Tabs on PC", "Share open tabs with your other device. Link once, both sides stay in sync", toggleEl(on), () => {
      SET.pcLink = null; SET.pcRemote = null; setPref("pcTabs", !on);
    })];
  if (!on) return out;
  if (!SET.pcSub) {
    SET.pcSub = true;
    window.lodica.on("pctabs.remote", (d) => { SET.pcRemote = d || { tabs: [], updated: 0 }; refreshSettings(); });
  }
  if (SET.pcLink == null) {
    SET.pcLink = "";
    inv("pctabs.link").then((u) => { SET.pcLink = u || ""; refreshSettings(); });
  }
  if (SET.pcRemote == null) {
    SET.pcRemote = false;
    inv("pctabs.remote").then((r) => { SET.pcRemote = r || { tabs: [], updated: 0 }; refreshSettings(); });
  }
  const u = SET.pcLink;
  out.push(setRow(u ? u : "Loading…", "Your link. Paste it on the other device to link", null));
  out.push(h("div", { class: "chips" },
    u ? btn("Copy", () => { inv("copy", u); toast("Link copied"); }) : null,
    u ? btn("Share", () => inv("share", u, true)) : null,
    btn("Link with other device", async () => {
      const v = await textDialog({ title: "Link with other device", message: "Paste the link shown on the other device.", placeholder: "https://…/t/…#…", ok: "Link" });
      if (v == null) return;
      const ok = await inv("pctabs.pair", v.trim());
      if (!ok) { toast("Not a valid link"); return; }
      SET.pcLink = null; SET.pcRemote = null;
      toast("Linked");
      refreshSettings();
    }),
    u ? btn("Reset link", async () => {
      const ok = await confirmDialog({ title: "Reset link?", message: "The current link stops working and the other device must link again.", ok: "Reset" });
      if (!ok) return;
      SET.pcLink = (await inv("pctabs.reset")) || ""; SET.pcRemote = null; refreshSettings();
    }, "muted") : null));
  const r = SET.pcRemote;
  if (r && r.tabs.length) {
    out.push(setRow("Tabs on the other device", r.tabs.length + (r.tabs.length === 1 ? " tab" : " tabs"), null));
    for (const t of r.tabs.slice(0, 40)) out.push(setRow(t.title, t.url, null, () => inv("link.open", t.url, false)));
    if (r.tabs.length > 40) out.push(setRow("+" + (r.tabs.length - 40) + " more", null, null));
  } else if (r) out.push(setRow("No tabs from the other device yet", "They appear once it links and syncs", null));
  return out;
}
// 5. Tabs
function secTabs() {
  const opts = [{ key: 0, label: "Never" }, { key: 7, label: "7 days" }, { key: 14, label: "14 days" }, { key: 30, label: "30 days" }];
  return [secHead("Tabs"), setRow("Auto-archive tabs unused for", null, null),
    chips(opts, S.prefs.autoArchiveDays ?? 14, (k) => setPref("autoArchiveDays", Number(k)))];
}
