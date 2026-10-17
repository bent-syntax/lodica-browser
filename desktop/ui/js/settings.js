"use strict";
// Settings sheet: framework and sections 1-5 (Search, Browsing, VPS, Tabs on PC, Tabs).
const SET = { find: "", tab: "search", keys: null, cap: null, capture: null, L: null, pcLink: null, pcRemote: null, pcSub: false, apps: null, meter: null, usage: null };

function openSettings(section) {
  if (SET.L) return SET.L;
  SET.L = openLayer({ key: "settings", cls: "spage-layer", dim: false, onClose: () => { SET.L = null; } }, (L) => {
    L.side = h("nav", { class: "sp-side", role: "tablist" });
    L.body = h("div", { class: "sp-body" });
    return h("div", { class: "spage" }, L.side,
      h("div", { class: "sp-main" },
        h("div", { class: "sp-head" }, h("h2", { id: "sp-title" }),
          h("input", { class: "sp-find", type: "search", placeholder: "Find a setting", value: SET.find || "",
            on: { input: (e) => { SET.find = e.target.value.trim(); renderSettings(); } } }), ib("close", "Close settings", () => L.close())),
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
  $("#sp-title", SET.L.el).textContent = SET.find ? "Search results" : (SET_TABS.find((t) => t[0] === SET.tab) || SET_TABS[0])[1];
  const pane = h("div", { class: "set-pane" }, SET.find ? setFindBody(SET.find) : setTabBody(SET.tab));
  cardify(pane);
  add(b, [pane]);
  b.scrollTop = top;
}
/** Groups every run of rows between two section headings into one rounded card. */
function cardify(pane) {
  const kids = Array.from(pane.children);
  pane.replaceChildren();
  let card = null;
  for (const k of kids) {
    if (k.classList.contains("set-sec")) { pane.append(k); card = null; continue; }
    if (!card) { card = h("div", { class: "set-card" }); pane.append(card); }
    card.append(k);
  }
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
  const cur = S.prefs.search || (S.relayAvail ? "LODICA" : "DUCKDUCKGO");
  const out = [secHead("Search"), chips(optList(S.engines), cur, (k) => setPref("search", k))];
  if (S.relayAvail) out.push(setRow("Fallback search engine", "Used when Lodica Search is chosen but the server cannot be reached"),
    chips(optList(S.engines).filter((o) => o.key !== "LODICA"), S.prefs.searchFallback || "DUCKDUCKGO", (k) => setPref("searchFallback", k)));
  return out;
}
// 2. Browsing
function secBrowsing() {
  const qs = (S.qualities || []).map((q) => ({ key: q, label: q + "p" }));
  return [secHead("Browsing"),
    setToggle("showRedirectOrigin", "Show original domain after redirects", "Address bar shows the site you started from, not the one you were sent to. Lock and security always use the real site"),
    setToggle("desktopDefault", "Desktop sites", "Request desktop pages in new tabs"),
    setRow("Dummy mail hidden sites", (S.prefs.noDummy || []).length ? S.prefs.noDummy.join(", ") : "None. The button shows on sign-up pages",
      (S.prefs.noDummy || []).length ? "Clear" : null, (S.prefs.noDummy || []).length ? () => setPref("noDummy", []) : null),
    setSelect("Video quality", "YouTube default. Change per site from the site menu", qs, "quality", Number)];
}
function secDarkPages() { return [setToggle("darkPages", "Dark pages", "Darken light sites that have no dark mode of their own")]; }
function secHttps() { return [setToggle("httpsOnly", "HTTPS-only", "Upgrade every connection, warn on plain HTTP"), S.relayAvail ? setToggle("routeVps", "Route through VPS", "Send browsing through your server's tunnel. Logins and payments stay direct") : null]; }
// 3. VPS
// Own domain redirects: a typed name (or *.name) opens another address.
function secDns() {
  const rules = Array.isArray(S.prefs.dnsRules) ? S.prefs.dnsRules : [];
  const save = (r) => { S.prefs.dnsRules = r; inv("prefs.set", "dnsRules", r); };
  const out = [secHead("Domain redirects"),
    h("div", { class: "set-note", text: "Send a name to another address, e.g. nas.home to 192.168.1.20:8080. *.example.com matches subdomains. Pages on that name load from the target." })];
  rules.forEach((r, i) => {
    const f = h("input", { type: "text", value: r.from || "", placeholder: "from", on: { change: (e) => { rules[i] = { ...rules[i], from: e.target.value.trim() }; save(rules); } } });
    const t = h("input", { type: "text", value: r.to || "", placeholder: "to", on: { change: (e) => { rules[i] = { ...rules[i], to: e.target.value.trim() }; save(rules); } } });
    out.push(setRow(null, null, h("span", { class: "dns-row" }, f, t, h("button", { class: "ib", title: "Remove", act: () => { save(rules.filter((_, j) => j !== i)); refreshSettings(); } }, ico("close")))));
  });
  out.push(setRow("Add redirect", null, ico("add"), () => { save(rules.concat({ from: "", to: "" })); refreshSettings(); }));
  return out;
}
// Device gate: pairing code for the server owner, and the hosts that receive the gate header.
async function enrollDevice() {
  const r = await inv("gate.enroll");
  if (!r || !r.ok) { toast({ text: (r && r.error) || "Couldn't enroll" }); return; }
  const mins = Math.max(1, Math.round((r.expires - Date.now()) / 60000));
  confirmDialog({ title: "Pairing code: " + r.code, message: "Single use, valid " + mins + " min. On your server run: sudo lodica-approve " + r.code, ok: "Done" });
  // Poll until the server owner approves the code, then say so.
  const until = r.expires;
  const tick = async () => {
    if (Date.now() > until) return;
    const st = await inv("gate.status", r.code);
    if (st === "approved") { toast({ text: "This device is enrolled. Gated sites will let it through." }); return; }
    if (st === "expired") return;
    setTimeout(tick, 3000);
  };
  setTimeout(tick, 3000);
}
function editGated() {
  textDialog({ title: "Gated hosts", message: "Comma separated, e.g. files.example.com. Subdomains match too.", ok: "Save", value: (S.prefs.gatedHosts || []).join(", ") }).then((v) => {
    if (v == null) return;
    inv("gate.setHosts", v.split(/[\s,]+/).filter(Boolean)).then((st) => { S.prefs.gatedHosts = st.hosts; refreshSettings(); });
  });
}
function secVps() {
  const link = () => {
    SET.vpsMsg = "";
    textDialog({ title: "Link your server", message: "The domain you gave the installer, like example.com", ok: "Next", placeholder: "example.com" }).then((domain) => {
      if (!domain) return;
      textDialog({ title: "Access token", message: "Run `sudo cat /etc/lodica-relay/token` on your server", ok: "Link", secret: true }).then(async (token) => {
        if (!token) return;
        SET.vpsMsg = "Connecting...";
        refreshSettings();
        const r = await inv("relay.link", domain, token);
        if (r && r.ok) { S.relayAvail = true; S.relay = Object.assign({}, S.relay, { available: true, domain: r.domain }); SET.vpsMsg = ""; }
        else SET.vpsMsg = (r && r.error) || "Couldn't link";
        refreshSettings();
      });
    });
  };
  const unlink = async () => {
    await inv("relay.unlink");
    const r = await inv("relay.info");
    S.relayAvail = !!(r && r.domain); S.relay = Object.assign({}, S.relay, { available: S.relayAvail, domain: r && r.domain });
    refreshSettings();
  };
  const out = [secHead("VPS")];
  if (S.relayAvail) {
    const d = S.relay && S.relay.domain;
    out.push(setRow("Linked server", d ? "lodica." + d : "Connected", "Unlink", unlink),
      setRow("Inbox", null, ico("chevron", "chev"), () => openInbox()),
      setRow("Enroll this device", "Let this device through your server's device gate", ico("chevron", "chev"), enrollDevice),
      setRow("Gated hosts", (S.prefs.gatedHosts || []).length ? S.prefs.gatedHosts.join(", ") : "None. Hosts listed here get this device's gate token",
        "Edit", editGated));
  } else {
    out.push(setRow("Link your server", "Enter the domain and token from the Lodica relay installer", ico("chevron", "chev"), link));
  }
  if (SET.vpsMsg) out.push(h("div", { class: "set-note", text: SET.vpsMsg }));
  return out;
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
