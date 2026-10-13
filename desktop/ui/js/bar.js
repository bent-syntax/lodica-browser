"use strict";
// Bottom bar: Main / Edit / Find states, load line, suggestions.
const BAR = { edit: null, sugg: null, findIn: null, q: "" };
const cap = (n, over) => (n > 99 ? over : String(n));

function renderLoad() {
  const t = S.tab, ll = $("#loadline");
  ll.classList.toggle("on", !!t.loading);
  $("i", ll).style.width = (t.loading ? Math.max(4, Math.min(100, t.progress || 0)) : 100) + "%";
}

function renderBar() {
  renderLoad();
  const bar = $("#bar");
  if (S.mode === "edit" && BAR.edit && bar.contains(BAR.edit)) return; // keep input focus/value
  if (S.mode === "find" && BAR.findIn && bar.contains(BAR.findIn)) return updateFindCount();
  clear(bar);
  bar.className = "m-" + S.mode;
  if (S.mode === "edit") add(bar, editBar());
  else if (S.mode === "find") add(bar, findBar());
  else add(bar, mainBar());
}

function mainBar() {
  const t = S.tab, off = !!t.trusted, n = t.blocked || 0;
  const shield = h("button", { class: "ib shield" + (off ? " muted" : " amber"),
    title: off ? "Protection off for this site" : "Protection on. Tap to trust this site", act: toggleShield },
    ico(off ? "shieldOff" : "shield"), !off && n > 0 ? h("span", { class: "n", text: cap(n, "99+") }) : null);
  if (t.home || t.locked) shield.disabled = true;
  const lead = t.home ? ico("search", "muted") : t.https === false ? ico("warning", "amber") : ico("lock", "muted");
  const txt = t.locked ? "" : (t.display || "");
  const pill = h("div", { class: "pill", act: () => enterEdit() },
    lead,
    t.private ? h("span", { class: "tag", text: "Private" }) : null,
    h("span", { class: "txt" + (txt ? "" : " muted"), text: txt || placeholder() }),
    t.routed ? h("button", { class: "ib amber", title: "Routed through VPS", act: () => toast("Routed through VPS") }, ico("vpn")) : null);
  const tc = h("span", { class: "tc" + (t.private ? " priv" : ""), text: cap(S.tabs.count || 0, ":D") });
  return [shield, pill,
    h("button", { class: "ib", title: "Tabs", act: () => openSwitcher() }, tc),
    ib("more", "Menu", () => openMenu())];
}
const placeholder = () => (S.prefs.search ? "Search " + engineLabel() + " or type URL" : "Search or type URL");

async function toggleShield() {
  const host = S.tab.host || hostOf(S.tab.url), was = !!S.tab.trusted;
  await inv("shield.toggle");
  toast(was ? "Protection back on for " + host : "Protection off for " + host);
}

// ---- Edit state ----
function enterEdit(text) {
  if (S.tab.locked) { toast("Private tab locked"); return; }
  if (S.mode === "edit") { BAR.edit && BAR.edit.focus(); return; }
  closeFind(true);
  S.mode = "edit";
  BAR.q = text != null ? text : (S.tab.home ? "" : (S.tab.display || S.tab.url || ""));
  renderBar();
  openSuggest();
  BAR.edit.focus();
  if (text == null) BAR.edit.select();
}
function exitEdit() {
  if (S.mode !== "edit") return;
  S.mode = "main"; BAR.edit = null;
  const L = BAR.sugg; BAR.sugg = null; if (L) L.close();
  renderBar();
}
function editBar() {
  const input = h("input", { type: "text", spellcheck: "false", autocomplete: "off", placeholder: placeholder(), value: BAR.q,
    on: { input: () => { BAR.q = input.value; syncEditBtns(); suggestSoon(); },
      keydown: (e) => {
        if (e.key === "Enter") { e.preventDefault(); goText(input.value); }
        else if (e.key === "Escape") { e.preventDefault(); exitEdit(); }
        else if (e.key === "ArrowUp" || e.key === "ArrowDown") moveSugg(e);
      } } });
  BAR.edit = input;
  const ask = h("button", { class: "btn ask", act: () => askAI(input.value) }, "Ask AI");
  const clr = ib("close", "Clear", () => { input.value = ""; BAR.q = ""; syncEditBtns(); suggestSoon(); input.focus(); });
  BAR.ask = ask; BAR.clr = clr;
  const pill = h("div", { class: "pill edit" }, ico("search", "muted"), input, ask, clr);
  setTimeout(syncEditBtns);
  return [ib("back", "Cancel", exitEdit), pill];
}
function syncEditBtns() {
  if (!BAR.edit) return;
  const has = BAR.edit.value.trim().length > 0;
  BAR.ask.classList.toggle("hidden", !(has && S.prefs.ai && S.ai.connected));
  BAR.clr.classList.toggle("hidden", !has);
}
function goText(text) {
  text = (text || "").trim();
  if (!text) return;
  exitEdit();
  inv("go", text);
}
function askAI(text) {
  text = (text || "").trim(); if (!text) return;
  exitEdit();
  openAiAnswer(text, "");
}

// ---- Suggestions (above-layer, bar stays usable) ----
function openSuggest() {
  if (BAR.sugg) return;
  BAR.sugg = openLayer({ above: true, dim: true, key: "sugg",
    onClose: () => { BAR.sugg = null; if (S.mode === "edit") { S.mode = "main"; BAR.edit = null; renderBar(); } },
    onEsc: () => exitEdit() },
  (L) => { L.list = h("div", { class: "sugg" }); return L.list; });
  loadSuggest();
}
const suggestSoon = debounce(() => loadSuggest(), 120);
let suggSeq = 0;
async function loadSuggest() {
  const L = BAR.sugg; if (!L) return;
  const q = (BAR.edit ? BAR.edit.value : BAR.q).trim(), seq = ++suggSeq;
  const items = q ? await inv("suggest", q) : await inv("topSites");
  if (seq !== suggSeq || BAR.sugg !== L) return;
  const rows = [];
  if (q) rows.push(suggRow("search", "Search " + engineLabel(), q, () => goText(q)));
  for (const it of items || []) {
    const s = typeof it === "string" ? { text: it } : it;
    const url = s.search ? "" : s.url || "", text = s.title || s.text || url;
    rows.push(suggRow(url ? "globe" : "search", text, url && url !== text ? hostOf(url) : "",
      () => goText(url || s.text || text),
      () => { BAR.edit.value = url || s.text || text; BAR.q = BAR.edit.value; syncEditBtns(); suggestSoon(); BAR.edit.focus(); }));
  }
  clear(L.list); add(L.list, rows);
  L.list.classList.toggle("hidden", rows.length === 0);
  BAR.sel = -1;
}
function suggRow(icon, t1, t2, go, fill) {
  return h("div", { class: "row click", act: go }, ico(icon, "muted"),
    h("div", { class: "main" }, h("div", { class: "t1", text: t1 }), t2 ? h("div", { class: "t2", text: t2 }) : null),
    fill ? h("button", { class: "ib", title: "Edit", "aria-label": "Edit", act: fill }, ico("up")) : null);
}
function moveSugg(e) {
  const L = BAR.sugg; if (!L) return;
  const rows = $$(".row", L.list); if (!rows.length) return;
  e.preventDefault();
  // list is column-reverse: visual "up" means next index
  BAR.sel = Math.max(-1, Math.min(rows.length - 1, (BAR.sel ?? -1) + (e.key === "ArrowUp" ? 1 : -1)));
  rows.forEach((r, i) => r.classList.toggle("sel", i === BAR.sel));
  if (BAR.sel >= 0) { rows[BAR.sel].scrollIntoView({ block: "nearest" }); }
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || S.mode !== "edit" || !BAR.sugg || (BAR.sel ?? -1) < 0) return;
  const r = $$(".row", BAR.sugg.list)[BAR.sel];
  if (r) { e.preventDefault(); e.stopImmediatePropagation(); r.click(); }
}, true);

// ---- Find state ----
function openFind() {
  if (S.tab.home) { toast("Wait for the page to load"); return; }
  if (S.mode === "edit") exitEdit();
  S.mode = "find"; S.find = { cur: 0, total: 0 };
  BAR.findIn = null;
  renderBar();
  BAR.findIn.focus();
}
function closeFind(silent) {
  if (S.mode !== "find") return;
  S.mode = "main"; BAR.findIn = null;
  inv("find.stop");
  if (!silent) renderBar();
}
const findSoon = debounce((t) => { if (t) inv("find", t, true); else { inv("find.stop"); S.find = { cur: 0, total: 0 }; updateFindCount(); } }, 140);
function findBar() {
  const input = h("input", { type: "text", spellcheck: "false", autocomplete: "off", placeholder: "Find in page",
    on: { input: () => findSoon(input.value.trim()),
      keydown: (e) => {
        if (e.key === "Enter") { e.preventDefault(); stepFind(!e.shiftKey); }
        else if (e.key === "Escape") { e.preventDefault(); closeFind(); }
      } } });
  BAR.findIn = input;
  BAR.cnt = h("span", { class: "cnt" });
  const pill = h("div", { class: "pill edit" }, ico("find", "muted"), input, BAR.cnt);
  updateFindCount();
  return [pill, ib("up", "Previous", () => stepFind(false)), ib("down", "Next", () => stepFind(true)),
    ib("close", "Close", () => closeFind())];
}
function stepFind(fwd) { const t = BAR.findIn && BAR.findIn.value.trim(); if (t) inv("find", t, fwd); }
function updateFindCount() {
  if (!BAR.cnt) return;
  const f = S.find || {}, has = BAR.findIn && BAR.findIn.value.trim();
  BAR.cnt.textContent = has ? (f.cur || 0) + "/" + (f.total || 0) : "";
}
