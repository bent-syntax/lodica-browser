"use strict";
// Main menu sheet and page context menu.
function openMenu() {
  if (S.mode !== "main") { exitEdit(); closeFind(); }
  const t = S.tab, home = !!t.home, q = t.quality || S.prefs.quality || 720;
  return sheet({ key: "menu", cls: "menu" }, (b, L) => {
    const go = (fn) => () => { L.close(); fn(); };
    const DEF_PINS = ["add", "private", "find", "download", "history", "settings"];
    let pins = Array.isArray(S.prefs.menuPins) ? S.prefs.menuPins.slice() : DEF_PINS.slice();
    let more = false;
    const grid = h("div", { class: "mgrid" });
    const cell = (icon, label, fn, cls, dis) => ({ key: icon, icon, label, fn, cls, dis });
    const implicit = !Array.isArray(S.prefs.menuPins);
    const togglePin = (k) => {
      if (implicit && !S.prefs.menuPins) pins = pins.concat(all.filter((c) => c.key.startsWith("ext:") && !pins.includes(c.key)).map((c) => c.key));
      pins =pins.includes(k) ? pins.filter((x) => x !== k) : pins.concat(k);
      S.prefs.menuPins = pins; inv("prefs.set", "menuPins", pins); render();
    };
    let all = [];
    const mk = (c) => {
      const on = pins.includes(c.key);
      const e = h("button", { class: "mcell" + (c.cls ? " " + c.cls : "") + (more && on ? " pinned" : ""),
        title: more ? (on ? "Unpin " : "Pin ") + c.label : c.label,
        act: more ? () => togglePin(c.key) : go(c.fn) },
        ico(c.icon), h("span", { text: c.label }));
      if (c.dis && !more) e.disabled = true;
      e.oncontextmenu = (ev) => { ev.preventDefault(); togglePin(c.key); };
      return e;
    };
    const render = () => {
      grid.replaceChildren();
      for (const c of all) if (more || pins.includes(c.key) || (implicit && !S.prefs.menuPins && c.key.startsWith("ext:"))) grid.append(mk(c));
      grid.append(h("button", { class: "mcell", act: () => { more = !more; render(); } },
        ico(more ? "close" : "apps"), h("span", { text: more ? "Done" : "More" })));
    };
    const top = h("div", { class: "mtop" },
      ib("back", "Back", go(() => inv("back")), t.canBack ? "" : "dis"),
      ib("forward", "Forward", go(() => inv("forward")), t.canForward ? "" : "dis"),
      t.loading ? ib("close", "Stop", go(() => inv("stop"))) : ib("reload", "Reload", go(() => inv("reload"))));
    $$(".ib.dis", top).forEach((x) => (x.disabled = true));
    const cells = [
      cell("add", "New tab", () => inv("tab.new", { private: false })),
      cell("private", "Private tab", () => inv("tab.new", { private: true }), "coral"),
      cell("find", "Find in page", openFind, "", home),
      cell("download", "Downloads", () => openDownloads()),
      cell("history", "History", () => openHistory()),
      cell("apps", "Install as app", async () => { const r = await inv("webapps.install"); toast(r && r.text || "Couldn't install"); }, "", home || !!t.private),
      cell("serial", "Serial monitor", () => openSerial()),
      cell("key", "Passwords", () => openPasswords()),
      cell("chat", "Server chat", () => openRoom(), "", !S.relayAvail),
      cell("edit", "Notebook", () => openNotebook(), "", !S.relayAvail),
      cell("phone", "Phone screen", () => openPhoneScreen(), "", !S.relayAvail),
      cell("ai", "AI chat", () => inv("ai.panel.toggle"), "", !(S.prefs.ai && S.ai && S.ai.connected)),
      cell("settings", "Settings", () => openSettings()),
    ];
    if (S.relayAvail && !home) cells.push(cell("email", "Hidden email", () => inv("email.fill"), "amber"));
    if (S.relayAvail && !home) {
      const off = (S.prefs.noDummy || []).includes((t.host || "").replace(/^www\./, ""));
      cells.push(cell("email", off ? "Dummy mail on" : "Dummy mail off", async () => { await inv("email.hide"); S.prefs.noDummy = (await inv("prefs.all"))?.noDummy || S.prefs.noDummy; }, off ? "coral" : ""));
    }
    if (S.relayAvail) cells.push(cell("inbox", "Inbox", () => openInbox()));
    cells.push(
      cell("reader", "Reader", () => openReader(), "", home),
      cell("lite", t.lite ? "Full site" : "Lite mode", () => inv("lite.toggle"), t.lite ? "amber" : "", home),
      cell("compat", t.compat ? "Compat on" : "Compat mode", () => inv("compat.toggle"), t.compat ? "amber" : "", home));
    const sp = +t.speed || 1;
    cells.push(
      cell("speed", sp !== 1 ? "Speed " + sp + "x" : "Video speed", () => openVideoSpeed(), sp !== 1 ? "amber" : "", home),
      cell("hd", "Quality " + q + "p", () => openVideoQuality(), "", home),
      cell("undo", "Closed tabs", () => openClosed()));
    all = cells;
    render();
    // One cell per enabled extension: opens its popup screen.
    inv("ext.list").then((xs) => {
      const on = (xs || []).filter((x) => x.on);
      if (!on.length || all !== cells) return;
      for (const x of on) cells.push(Object.assign(cell("apps", x.name.slice(0, 18), async () => {
        const r = await inv("ext.open", x.id, { x: window.screenX + window.innerWidth - 400, y: window.screenY + 60 });
        if (r && !r.ok) toast(r.error);
      }), { key: "ext:" + x.id }));
      render();
    });
    add(b, [top, h("div", { class: "divider" }), grid]);
  });
}

// Context menu at {x,y}: link / media / selection / editable.
function openContext(d) {
  d = d || {};
  const link = d.linkURL || "", src = d.srcURL || "", mt = d.mediaType || "none";
  const kind = mt === "image" ? "image" : mt === "video" ? "video" : mt === "audio" ? "audio" : "";
  const items = [];
  if (link) {
    items.push(["add", "Open in new tab", () => inv("link.open", link, false)]);
    items.push(["private", "Open in private tab", () => inv("link.open", link, true), "coral"]);
    items.push(["preview", "Preview link", () => openPreview(link)],
      ["copy", "Copy link", () => { inv("copyLink", link); }],
      ["download", "Download link", () => inv("link.download", link)]);
  }
  if (kind && src) {
    if (items.length) items.push(null);
    items.push(["open", "Open " + kind + " in new tab", () => inv("link.open", src, sameTabPrivacy())],
      ["download", "Download " + kind, () => inv("link.download", src)],
      ["copy", "Copy " + kind + " address", () => inv("copyLink", src)]);
  }
  const sel = (d.selectionText || "").trim();
  if (sel && !link) {
    if (items.length) items.push(null);
    items.push(["copy", "Copy", () => inv("copy", sel)],
      ["search", "Search " + engineLabel(), () => inv("tab.new", { private: sameTabPrivacy(), url: sel })]);
    if (S.prefs.ai && S.ai.connected) items.push(["ai", "Ask AI", () => openAiAnswer(sel, "")]);
  }
  if (!items.length) return;
  const head = link || src || "";
  return openLayer({ key: "ctx", cls: "ctxL", dim: true }, (L) => {
    const box = h("div", { class: "ctx" }, head ? h("div", { class: "ctx-head", text: head }) : null);
    for (const it of items) {
      if (!it) { box.append(h("div", { class: "divider" })); continue; }
      box.append(h("button", { class: "row" + (it[3] ? " " + it[3] : ""), act: () => { L.close(); it[2](); } }, ico(it[0]), h("span", { text: it[1] })));
    }
    placeCtx(box, d.x || 0, d.y || 0);
    return box;
  });
}
function placeCtx(box, x, y) {
  box.style.left = "0px"; box.style.top = "0px";
  requestAnimationFrame(() => {
    const W = innerWidth, H = innerHeight, r = box.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(x, W - r.width - 8)) + "px";
    box.style.top = Math.max(8, Math.min(y, H - 58 - r.height - 8)) + "px";
  });
}

// Site info popover under the lock: protection stats, per-site switches, clear data.
function openSiteInfo() {
  const t = S.tab, host = t.host || hostOf(t.display || "") || "";
  return openLayer({ key: "siteinfo", cls: "popL" }, (L) => {
    const stat = (icon, val, label, cls) => h("div", { class: "stat" + (cls ? " " + cls : "") }, ico(icon), h("b", { text: val }), h("span", { text: label }));
    const savedB = h("b", { text: "…" });
    const saved = h("div", { class: "stat acc" }, ico("speed"), savedB, h("span", { text: "Saved" }));
    inv("meter.list").then((m) => {
      const x = ((m && m.hosts) || []).find((r) => r.host === host);
      savedB.textContent = fmtBytes(x ? (x.saved || 0) : 0);
    }).catch(() => { savedB.textContent = "0 B"; });
    const sw = (icon, label, on, fn) => h("button", { class: "srow", act: () => { L.close(); fn(); } },
      ico(icon), h("span", { text: label }), toggleEl(on));
    return h("div", { class: "pop" },
      h("div", { class: "pop-head" },
        h("div", { class: "pop-fav" }, h("span", { text: (host || "?")[0].toUpperCase() })),
        h("div", { class: "main" }, h("div", { class: "t1", text: host }),
          h("div", { class: "t2" }, ico(t.https === false ? "warning" : "lock"),
            t.https === false ? "Not secure" : t.routed ? "Secure · through your VPS" : "Secure")),
        ib("close", "Close", () => L.close())),
      h("div", { class: "stats" }, stat("shield", String(t.blocked || 0), "Blocked"), saved),
      sw("lite", "Lite mode", !!t.lite, () => inv("lite.toggle")),
      sw("compat", "Compatibility mode", !!t.compat, () => inv("compat.toggle")),
      h("div", { class: "pop-foot" },
        h("button", { class: "clr", act: async () => {
          L.close();
          if (await confirmDialog({ title: "Clear site data?", message: "Cookies, cache and storage for all sites. You will be logged out everywhere.", ok: "Clear", danger: true })) { await inv("privacy.clearSiteData"); toast("Site data cleared"); }
        } }, ico("delete"), "Clear all site data"),
        h("button", { class: "chip", act: () => { L.close(); openVideoQuality(); } }, ico("hd"), "Quality")));
  });
}
