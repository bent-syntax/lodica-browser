"use strict";
// Tab switcher: normal/private grids, archived and recently closed lists.
const SW = { L: null, priv: false, thumbs: new Map() };

function openSwitcher(priv) {
  if (S.mode !== "main") { exitEdit(); closeFind(); }
  SW.priv = priv != null ? !!priv : !!S.tab.private;
  SW.L = openLayer({ key: "switcher", dim: false, onClose: () => { SW.L = null; SW.thumbs.clear(); } }, (L) => {
    L.root = h("div", { class: "sw" });
    return L.root;
  });
  renderSwitcher();
  return SW.L;
}
const refreshSwitcher = debounce(() => { if (SW.L) renderSwitcher(); }, 60);

async function renderSwitcher() {
  const L = SW.L; if (!L) return;
  const data = (await inv("tab.list")) || { tabs: [], archived: [], closed: [] };
  if (SW.L !== L) return;
  const tabs = (data.tabs || []).filter((t) => !!t.private === SW.priv);
  const locked = SW.priv && S.locked;
  const seg = h("div", { class: "seg" },
    h("button", { class: SW.priv ? "" : "sel", act: () => { SW.priv = false; renderSwitcher(); } }, ico("globe"), "Tabs " + (S.tabs.count || 0)),
    h("button", { class: SW.priv ? "sel" : "", act: () => { SW.priv = true; renderSwitcher(); } }, ico("private"), "Private " + (S.tabs.privateCount || 0)));
  const head = h("div", { class: "sw-head" }, seg,
    h("div", { class: "row-end" },
      tabs.length && !locked ? btn("Close all", () => confirmCloseAll(), "muted") : null,
      ib("close", "Close", () => L.close())));
  const body = h("div", { class: "sw-body" });
  if (locked) {
    body.append(h("div", { class: "sw-lock" }, ico("lock"), h("div", { text: "Locked" }),
      btn("Unlock private tabs", () => unlockPrivate(), "fill")));
  } else if (!tabs.length) {
    body.append(h("div", { class: "empty", text: SW.priv ? "No private tabs" : "No tabs" }));
  } else {
    body.append(h("div", { class: "sw-grid" }, tabs.map(card)));
  }
  if (!SW.priv) {
    const arch = data.archived || [];
    if (arch.length) {
      body.append(h("div", { class: "sw-sec" }, ico("archive"), h("span", { class: "grow", text: "Archived (" + arch.length + ")" }),
        btn("Clear", () => { inv("tab.clearArchived").then(refreshSwitcher); }, "muted")));
      body.append(h("div", { class: "sw-list" }, arch.map(archRow)));
    }
    const closed = data.closed || [];
    if (closed.length) {
      body.append(h("div", { class: "sw-sec" }, ico("undo"), h("span", { class: "grow", text: "Recently closed" })));
      body.append(h("div", { class: "sw-list" }, closed.slice(0, 10).map((c, i) =>
        h("div", { class: "arow", act: () => { L.close(); inv("tab.reopen", i); } },
          h("span", { class: "dot" }),
          h("div", { class: "main" }, h("div", { class: "t1", text: c.title || c.url }), h("div", { class: "t2", text: hostOf(c.url) }))))));
    }
  }
  const fab = h("button", { class: "sw-fab" + (SW.priv ? " priv" : ""), act: () => { L.close(); inv("tab.new", { private: SW.priv }); } },
    ico("add"), h("span", { text: "New tab" }));
  clear(L.root); add(L.root, [head, body, locked ? null : fab]);
  loadThumbs(tabs);
}
function card(t) {
  const cur = t.id === S.tab.id;
  const th = h("div", { class: "thumb" + (t.locked ? " locked" : "") }, ico(t.locked ? "lock" : t.home ? "search" : "globe"));
  th.dataset.id = t.id;
  const u = SW.thumbs.get(t.id); if (u) { th.style.backgroundImage = "url(" + JSON.stringify(u) + ")"; clear(th); }
  return h("div", { class: "card" + (cur ? " cur" : "") + (t.private ? " priv" : ""), act: () => { SW.L && SW.L.close(); inv("tab.select", t.id); } },
    h("div", { class: "card-top" }, ico(t.private ? "private" : "globe", "fav"),
      h("span", { class: "t", text: t.home ? "New tab" : (t.title || t.url || "New tab") }),
      ib("close", "Close tab", () => closeTab(t.id))),
    th);
}
async function loadThumbs(tabs) {
  for (const t of tabs) {
    if (t.locked || t.home || SW.thumbs.has(t.id)) continue;
    const u = await inv("tab.thumb", t.id);
    if (!SW.L) return;
    SW.thumbs.set(t.id, u || "");
    const th = SW.L.root.querySelector('.thumb[data-id="' + CSS.escape(String(t.id)) + '"]');
    if (th && u) { th.style.backgroundImage = "url(" + JSON.stringify(u) + ")"; clear(th); }
  }
}
function archRow(t) {
  return h("div", { class: "arow", act: () => { SW.L && SW.L.close(); inv("tab.restore", t.id).then(() => inv("tab.select", t.id)); } },
    h("span", { class: "dot" }),
    h("div", { class: "main" }, h("div", { class: "t1", text: t.title || t.url }), h("div", { class: "t2", text: hostOf(t.url) })),
    ib("unarchive", "Restore", () => { inv("tab.restore", t.id).then(refreshSwitcher); }),
    ib("delete", "Delete", () => { inv("tab.deleteArchived", t.id).then(refreshSwitcher); }));
}
async function closeTab(id) {
  SW.thumbs.delete(id);
  await inv("tab.close", id);
  refreshSwitcher();
  toast({ text: "Tab closed", icon: "delete", actions: [{ label: "Undo", fn: () => inv("tab.undoClose").then(refreshSwitcher) }] });
}
async function confirmCloseAll() {
  const ok = await confirmDialog({ title: "Close all", message: SW.priv ? "Close all private tabs?" : "Close all tabs?", ok: "Close all" });
  if (!ok) return;
  await inv("tab.closeAll", SW.priv);
  SW.thumbs.clear(); refreshSwitcher();
}
async function unlockPrivate() {
  const pin = await pinDialog({ title: "Unlock private tabs", message: "Confirm it's you" });
  if (pin == null) return;
  const ok = await inv("private.unlock", pin);
  if (!ok) toast("Wrong PIN"); else { S.locked = false; refreshSwitcher(); }
}
