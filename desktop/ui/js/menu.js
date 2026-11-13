"use strict";
// Main menu sheet and page context menu.
function openMenu() {
  if (S.mode !== "main") { exitEdit(); closeFind(); }
  const t = S.tab, home = !!t.home, q = t.quality || S.prefs.quality || 720;
  const bt = document.body.classList.contains("bt");
  return openLayer({ key: "menu", cls: "menu" }, (L) => {
    const go = (fn) => () => { L.close(); fn(); };
    const tile = (icon, label, fn, cls, dis) => {
      const e = h("button", { class: "mtile" + (cls ? " " + cls : ""), title: label, act: go(fn) }, ico(icon), h("span", { text: label }));
      if (dis) e.disabled = true;
      return e;
    };
    const row = (icon, label, fn, o) => {
      o = o || {};
      const e = h("button", { class: "srow" + (o.cls ? " " + o.cls : ""), act: go(fn) },
        ico(icon), h("span", { text: label }),
        o.sw != null ? toggleEl(o.sw) : o.val ? h("span", { class: "val", text: o.val }) : null);
      if (o.dis) e.disabled = true;
      return e;
    };
    const group = (...rows) => { const r = rows.filter(Boolean); return r.length ? h("div", { class: "mgroup" }, ...r) : null; };
    const sp = +t.speed || 1;
    const off = (S.prefs.noDummy || []).includes((t.host || "").replace(/^www\./, ""));
    const ai = !!(S.prefs.ai && S.ai && S.ai.connected);
    const relay = S.relayAvail;
    const tiles = h("div", { class: "mtiles" },
      tile("add", "New tab", () => inv("tab.new", { private: false })),
      tile("private", "Private", () => inv("tab.new", { private: true }), "private"),
      tile("download", "Downloads", () => openDownloads()),
      tile("history", "History", () => openHistory()));
    const extBox = h("div", { class: "mgroup" });
    const pop = h("div", { class: "pop menu-pop", style: "right:8px;" + (bt ? "top:" + (document.querySelector(".pill") ? Math.round(document.querySelector(".pill").getBoundingClientRect().bottom + 4) : 52) + "px" : "bottom:" + (document.querySelector(".pill") ? Math.round(innerHeight - document.querySelector(".pill").getBoundingClientRect().top + 4) : 52) + "px") },
      tiles,
      group(
        row("find", "Find in page", openFind, { dis: home }),
        row("reader", "Reader", () => openReader(), { dis: home }),
        row("apps", "Install as app", async () => { const r = await inv("webapps.install"); toast(r && r.text || "Couldn't install"); }, { dis: home || !!t.private })),
      group(
        row("lite", "Lite mode", () => inv("lite.toggle"), { sw: !!t.lite, dis: home }),
        row("compat", "Compatibility mode", () => inv("compat.toggle"), { sw: !!t.compat, dis: home }),
        row("speed", "Video speed", () => openVideoSpeed(), { val: sp !== 1 ? sp + "x" : "1x", dis: home }),
        row("hd", "Video quality", () => openVideoQuality(), { val: q + "p", dis: home })),
      group(
        row("key", "Passwords", () => openPasswords()),
        relay && !home ? row("email", "Hidden email", () => inv("email.fill")) : null,
        relay && !home ? row("email", off ? "Dummy mail on" : "Dummy mail off", async () => { await inv("email.hide"); S.prefs.noDummy = (await inv("prefs.all"))?.noDummy || S.prefs.noDummy; }) : null,
        relay ? row("inbox", "Inbox", () => openInbox()) : null),
      group(
        row("chat", "Server chat", () => openRoom(), { dis: !relay }),
        row("edit", "Notebook", () => openNotebook(), { dis: !relay }),
        row("phone", "Phone screen", () => openPhoneScreen(), { dis: !relay }),
        row("ai", "AI chat", () => inv("ai.panel.toggle"), { dis: !ai }),
        row("serial", "Serial monitor", () => openSerial())),
      extBox,
      group(
        row("undo", "Closed tabs", () => openClosed()),
        row("settings", "Settings", () => openSettings())));
    // One row per enabled extension: opens its popup screen.
    inv("ext.list").then((xs) => {
      for (const x of (xs || []).filter((y) => y.on)) extBox.append(row("apps", x.name.slice(0, 24), async () => {
        const r = await inv("ext.open", x.id, { x: window.screenX + window.innerWidth - 400, y: window.screenY + 60 });
        if (r && !r.ok) toast(r.error);
      }));
    });
    return pop;
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
    items.push(["private", "Open in private tab", () => inv("link.open", link, true), "private"]);
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
    const r = (document.querySelector(".pill") || document.body).getBoundingClientRect();
    const pos = "left:" + Math.max(8, Math.round(r.left)) + "px;" + (document.body.classList.contains("bt") ? "top:" + Math.round(r.bottom + 4) + "px" : "bottom:" + Math.round(innerHeight - r.top + 4) + "px");
    const prot = h("button", { class: "srow", act: () => { L.close(); toggleShield(); } },
      ico(t.trusted ? "shieldOff" : "shield"), h("span", { text: "Protection" }), toggleEl(!t.trusted));
    return h("div", { class: "pop", style: pos },
      h("div", { class: "pop-head" },
        h("div", { class: "pop-fav" }, h("span", { text: (host || "?")[0].toUpperCase() })),
        h("div", { class: "main" }, h("div", { class: "t1", text: host }),
          h("div", { class: "t2" }, ico(t.https === false ? "warning" : "lock"),
            t.https === false ? "Not secure" : t.routed ? "Secure · through your VPS" : "Secure")),
        ib("close", "Close", () => L.close())),
      prot,
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
