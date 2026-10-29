"use strict";
// Settings sheet: framework and sections 1-5 (Search, Browsing, VPS, Tabs on PC, Tabs).
const SET = { find: "", tab: "search", keys: null, cap: null, capture: null, L: null, pcLink: null, pcRemote: null, pcSub: false, apps: null, meter: null, usage: null };

function openSettings(section) {
  if (SET.L) return SET.L;
  SET.L = openLayer({ key: "settings", cls: "spage-layer", dim: false, onClose: () => { SET.L = null; document.removeEventListener("keydown", setSlash, true); } }, (L) => {
    L.nav = h("div", { class: "sp-nav" });
    const find = h("input", { class: "sp-find", type: "search", placeholder: "Find a setting", "aria-label": "Find a setting", value: SET.find || "",
      on: { input: (e) => { SET.find = e.target.value.trim(); renderSettings(); } } });
    L.findEl = find;
    L.side = h("nav", { class: "sp-side" }, h("div", { class: "sp-title", text: "Settings" }),
      h("div", { class: "sp-findbox" }, ico("search"), find, h("kbd", { text: "/" })), L.nav,
      h("div", { class: "sp-ver", text: S.version ? "Lodica " + S.version : "Lodica" }));
    L.body = h("div", { class: "sp-body" });
    return h("div", { class: "spage" }, L.side,
      h("div", { class: "sp-main" },
        h("div", { class: "sp-head" }, h("h2", { id: "sp-title" }), ib("close", "Close settings", () => L.close())),
        L.body));
  });
  document.addEventListener("keydown", setSlash, true);
  if (section && SET_SECTION_TAB[section]) SET.tab = SET_SECTION_TAB[section];
  renderSettings();
  if (section) setTimeout(() => { const el = SET.L && SET.L.body.querySelector('[data-sec="' + section + '"]'); if (el) el.scrollIntoView(); }, 50);
  return SET.L;
}
/** "/" focuses the find box unless typing in a field. */
function setSlash(e) {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || !SET.L) return;
  const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  e.preventDefault(); SET.L.findEl.focus();
}
const refreshSettings = debounce(() => { if (SET.L) renderSettings(); }, 50);

function renderSettings() {
  const b = SET.L.body, top = b.scrollTop;
  clear(b); clear(SET.L.nav);
  $("#sp-title", SET.L.el).textContent = SET.find ? "Search results" : (SET_TABS.find((t) => t[0] === SET.tab) || SET_TABS[0])[1];
  if (SET.find) { SET.shownTab = null; add(SET.L.nav, [setFindList(SET.find)]); add(b, [h("div", { class: "set-pane" }, h("div", { class: "set-note", text: "Pick a result on the left." }))]); b.scrollTop = 0; return; }
  add(SET.L.nav, [setTabBar()]);
  const pane = h("div", { class: "set-pane" + (SET.shownTab === SET.tab ? "" : " in") }, setTabBody(SET.tab));
  SET.shownTab = SET.tab;
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
    if (k.classList.contains("set-sec") || k.classList.contains("set-hero")) { pane.append(k); card = null; continue; }
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
    setSelect("Video quality", "YouTube default. Change per site from the site menu", qs, "quality", Number),
    setSelect("Site language", null, S.languages, "language")];
}
function secDarkPages() {
  return [setToggle("darkPages", "Dark mode", "Sites that have a dark mode switch to it"),
    setToggle("forceDark", "Force dark", "Make every page dark, even sites with no dark mode")];
}
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
  const out = [h("div", { class: "set-hero relay" + (S.relayAvail ? " on" : "") }, h("span", { class: "hero-ico" }, ico("vpn")),
      h("div", { class: "main" }, h("div", { class: "t1", text: S.relayAvail ? "Server connected" : "No server linked" }),
        h("div", { class: "t2", text: S.relayAvail ? "lodica." + ((S.relay && S.relay.domain) || "") : "Link your own relay for private routing and hidden email" }))), secHead("VPS")];
  if (S.relayAvail) {
    const d = S.relay && S.relay.domain;
    out.push(setRow("Linked server", d ? "lodica." + d : "Connected", "Unlink", unlink),
      setRow("Inbox", null, ico("chevron", "chev"), () => openInbox()));
  } else {
    out.push(setRow("Link your server", "Enter the domain and token from the Lodica relay installer", ico("chevron", "chev"), link));
  }
  if (SET.vpsMsg) out.push(h("div", { class: "set-note", text: SET.vpsMsg }));
  return out;
}
// 4. Tabs on PC
function enterCodeBtn() {
  return btn("Enter link code", async () => {
      const v = await textDialog({ title: "Enter link code", message: "Type the 6 character code shown on the other device.", placeholder: "ABC123", ok: "Link" });
      if (v == null) return;
      const ok = await inv("pctabs.pairCode", v.trim());
      if (!ok) { toast("Wrong or expired code"); return; }
      SET.pcLink = null; SET.pcRemote = null;
      toast("Linked");
      refreshSettings();
    });
}

function secEmojis() {
  const out = [secHead("Server emojis", "emojis"), setRow("Server emojis", "Custom emojis stored on your Lodica server. Click one to copy it as an image", null)];
  out.push(setToggle("emojiPicker", "Emoji picker shortcut", "Press Ctrl+Alt+E in any program to pick a server emoji, then paste it"));
  if (!S.relayAvail) return out.concat(setRow("No server linked", "Set up a relay first", null));
  out.push(h("div", { class: "chips" }, btn("Load server emojis", async () => {
    SET.emojis = (await inv("emojis.list")) || [];
    if (!SET.emojis.length) toast("No emojis on the server");
    refreshSettings();
  })));
  if (SET.emojis && SET.emojis.length) {
    out.push(h("div", { class: "chips" }, SET.emojis.map(e => h("img", {
      src: "data:image/png;base64," + e.png, title: e.name, width: 36, height: 36, style: "cursor:pointer",
      act: async () => toast((await inv("emojis.copy", e.name)) ? "Copied " + e.name : "Could not copy"),
    }))));
  }
  return out;
}

function secPcTabs() {
  const on = !!S.prefs.pcTabs;
  const out = [secHead("Linked devices", "pctabs"),
    setRow("Linked devices", "Link your phone and PC once, then choose below what they share. Both sides stay in sync", toggleEl(on), () => {
      SET.pcLink = null; SET.pcRemote = null; setPref("pcTabs", !on);
    })];
  if (!on) { out.push(h("div", { class: "chips" }, enterCodeBtn())); return out; }
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
    btn("Show link code", async () => {
      const c = await inv("pctabs.code");
      if (!c) { toast("Could not make a code. Is the relay set up?"); return; }
      await textDialog({ title: "Link code", message: "Type this code on your other device within 10 minutes: Settings, Linked devices, Enter link code.", value: c, ok: "Done" });
    }),
    enterCodeBtn(),
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
  out.push(...linkRows());
  out.push(setRow("Control the phone", "Open a page on the linked phone. The phone must allow control in its settings", null));
  out.push(h("div", { class: "chips" },
    btn("Open page on phone", async () => {
      const v = await textDialog({ title: "Open on phone", message: "Address to open on the linked phone.", placeholder: "https://…", ok: "Send" });
      if (v == null || !v.trim()) return;
      const u = /^https?:\/\//i.test(v.trim()) ? v.trim() : (/^((\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])(:\d+)?([/?#]|$)/i.test(v.trim()) ? "http://" : "https://") + v.trim();
      toast((await inv("pctabs.control", "open", u)) ? "Sent to phone" : "Could not send");
    }),
    btn("Show phone tab", async () => {
      const r = SET.pcRemote;
      if (!r || !r.tabs.length) { toast("No phone tabs yet"); return; }
      const v = await textDialog({ title: "Show phone tab", message: "Number of the tab to switch to on the phone (1 to " + Math.min(r.tabs.length, 40) + ").", placeholder: "1", ok: "Show" });
      const t = r.tabs[Number(v) - 1];
      if (!t) return;
      toast((await inv("pctabs.control", "focus", t.url)) ? "Sent to phone" : "Could not send");
    }, "muted"),
    btn("Reload on phone", async () => toast((await inv("pctabs.control", "reload", "")) ? "Sent to phone" : "Could not send"), "muted")));
  const r = SET.pcRemote;
  if (r && r.tabs.length) {
    out.push(setRow("Tabs on the other device", r.tabs.length + (r.tabs.length === 1 ? " tab" : " tabs"), null));
    for (const [i, t] of r.tabs.slice(0, 40).entries()) out.push(setRow((i + 1) + ". " + t.title, t.url, null, () => inv("link.open", t.url, false)));
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

// ---- Linked devices: what to share and the link key ----
// The key protects passwords, authenticator keys and Wi-Fi passwords. A new device gets it by file plus a one-time code shown on
// the device that made the file (valid 30 seconds, one use), or by a file carried over a USB cable and inserted with one button.
function linkRows() {
  if (!SET.linkSub) {
    SET.linkSub = true;
    window.lodica.on("link.key", (m) => linkKeyStep(m || {}));
  }
  if (SET.linkCats == null) {
    SET.linkCats = false;
    inv("link.cats").then((r) => { SET.linkCats = r || { cats: [], key: {} }; refreshSettings(); });
  }
  const L = SET.linkCats || { cats: [], key: {}, bluetooth: [] }, hasKey = !!(L.key && L.key.hasKey);
  const reload = () => { SET.linkCats = null; refreshSettings(); };
  const out = [setRow("What to share", "Switch on what this device sends to the linked device and takes in from it", null)];
  for (const c of L.cats) {
    out.push(setRow(c.label, c.note + (c.locked && !hasKey ? ". Create or insert the link key below first" : ""), toggleEl(c.on), async () => {
      await inv("link.sel", c.id, !c.on); reload();
    }));
  }
  if (L.bluetooth && L.bluetooth.length) out.push(setRow("Bluetooth devices on the other device", L.bluetooth.join(", "), null));
  if (L.keyMissing) out.push(setRow("The other device shares passwords or keys", "Insert the link key on this device to receive them", null));
  out.push(setRow("Link key", hasKey ? "This device has the link key. Make a key file to put it on another device" : "No key on this device yet. Create one, or insert a key file made on the other device", null));
  out.push(h("div", { class: "chips" },
    !hasKey ? btn("Create key", async () => { await inv("link.key.create"); reload(); }) : null,
    hasKey ? btn("Save key file (code)", async () => {
      const r = await inv("link.key.save", false);
      if (r && r.ok) toast("Key file saved. On the new device choose Insert key file. A code appears here");
    }) : null,
    hasKey ? btn("Save key file for a cable", async () => {
      const ok = await confirmDialog({ title: "File for a cable", message: "This file holds the key itself. Copy it over the USB cable to the desktop, insert it there, then delete it. Anyone who gets the file gets the key.", ok: "Save the file" });
      if (!ok) return;
      const r = await inv("link.key.save", true);
      if (r && r.ok) toast("Saved. Copy it over the cable, then insert it on the desktop");
    }) : null,
    btn("Insert key file", async () => {
      const r = await inv("link.key.insert");
      if (!r || r.canceled) return;
      if (r.error) { toast(r.error); return; }
      if (r.ok) { toast("Key inserted"); reload(); return; }
      toast("Asking the other device for a code…");
    }),
    hasKey ? btn("Forget key", async () => {
      const ok = await confirmDialog({ title: "Forget the link key?", message: "Passwords, authenticator keys and Wi-Fi passwords stop syncing until you insert a key again.", ok: "Forget" });
      if (ok) { await inv("link.key.forget"); reload(); }
    }, "muted") : null));
  return out;
}
// Steps of moving the key, from the main process.
async function linkKeyStep(m) {
  if (m.step === "code") {
    await textDialog({ title: "Code for the new device", message: "Type this code on the new device within " + (m.seconds || 30) + " seconds. It works once.", value: m.code, ok: "Done" });
  } else if (m.step === "enter") {
    const v = await textDialog({ title: "Enter the code", message: "Type the 6-digit code shown on the device that made the key file. It is valid for 30 seconds.", placeholder: "123456", ok: "Send" });
    if (v != null) inv("link.key.enter", v.trim());
  } else if (m.step === "done") { toast("Key inserted"); SET.linkCats = null; refreshSettings(); }
  else if (m.step === "sent") toast("The new device has the key");
  else if (m.step === "bad") toast(m.error === "too many tries" ? "Too many wrong codes. Start again" : m.error === "expired" ? "The code expired. Start again" : "Wrong code");
  else if (m.step === "unknown") toast("That device did not make this key file");
  else if (m.step === "expired") toast("Waited too long. Start again");
}
