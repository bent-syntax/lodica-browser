"use strict";
// Main menu sheet and page context menu.
function openMenu() {
  if (S.mode !== "main") { exitEdit(); closeFind(); }
  const t = S.tab, home = !!t.home, q = t.quality || S.prefs.quality || 720;
  return sheet({ key: "menu", cls: "menu" }, (b, L) => {
    const go = (fn) => () => { L.close(); fn(); };
    const cell = (icon, label, fn, cls, dis) => {
      const c = h("button", { class: "mcell" + (cls ? " " + cls : ""), title: label, act: go(fn) }, ico(icon), h("span", { text: label }));
      if (dis) c.disabled = true;
      return c;
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
      cell("inbox", "Server chat", () => openRoom(), "", !S.relayAvail),
      cell("ai", "AI chat", () => openAiChat(), "", !(S.prefs.ai && S.ai && S.ai.connected)),
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
    add(b, [top, h("div", { class: "divider" }), h("div", { class: "mgrid" }, cells)]);
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
