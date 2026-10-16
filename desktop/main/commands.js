// Renderer commands (see IPC.md), registered on the ui dispatcher.
const keys = require("./keys");
const { app, clipboard, shell, session, net, WebContentsView, Menu, screen } = require("electron");

let d = null, preview = null, previewPrivate = false;

const str = v => (v == null ? "" : String(v));
// Drop "?query" and anything after it. A "#fragment" before the "?" survives; one behind it goes with the query.
const cleanUrl = u => { const s = str(u), i = s.indexOf("?"); return i < 0 ? s : s.slice(0, i); };
const isWeb = u => /^https?:\/\//i.test(str(u));
const cur = () => d.tabs.current();
const curWc = () => d.tabs.wcOf();
const curSession = () => (cur()?.private ? session.fromPartition("lodica-private") : session.defaultSession);

function applyAgent(t, wc) {
  if (!t || !wc || wc.isDestroyed()) return;
  const ua = d.prefs.agentFor(t);
  wc.setUserAgent(ua);
}

/** Open the system on-screen keyboard (Windows osk.exe; on Linux the first of a few common ones). */
function openKeyboard() {
  const { spawn } = require("child_process");
  const list = process.platform === "win32" ? ["osk.exe"] : process.platform === "linux" ? ["onboard", "florence", "matchbox-keyboard", "maliit-keyboard"] : [];
  const next = i => {
    if (i >= list.length) { d.ui.toast("No on-screen keyboard found on this system"); return; }
    const child = spawn(list[i], [], { detached: true, stdio: "ignore" });
    child.once("error", () => next(i + 1));
    child.unref();
  };
  next(0);
  return true;
}

// Actions the renderer UI performs itself (it owns the sheets and the address field).
const UI_ACTIONS = new Set(["address", "find", "switcher", "menu", "settings", "history", "downloads"]);

/** Run a keybindable action by id. UI-side actions are forwarded to the bar view. */
function runKey(id) {
  const { tabs, ui, prefs } = d;
  if (UI_ACTIONS.has(id)) { ui.push("shortcut", id); return true; }
  switch (id) {
    case "newTab": tabs.create({}); break;
    case "newPrivate": tabs.create({ private: true }); break;
    case "undoClose": tabs.undoClose(); break;
    case "closeTab": tabs.close(tabs.current()?.id); break;
    case "nextTab": tabs.cycle(1); break;
    case "prevTab": tabs.cycle(-1); break;
    case "reload": tabs.reload(false); break;
    case "hardReload": tabs.reload(true); break;
    case "back": tabs.back(); break;
    case "forward": tabs.forward(); break;
    case "devtools": { const wc = tabs.wcOf(); if (wc && !wc.isDestroyed()) wc.toggleDevTools(); break; }
    case "osk": openKeyboard(); break;
    case "toggleVertical": prefs.set("vertTabs", !prefs.p.vertTabs); break;
    case "toggleSplit": if (tabs.toggleSplit) tabs.toggleSplit(); break;
    default: return false;
  }
  return true;
}

let keyMapFor = null, keyMap = {};
/** combo -> action id, memoised on the stored overrides. */
function keyActionFor(combo) {
  const over = d.prefs.p.keybinds;
  if (keyMapFor !== over) { keyMap = keys.map(over); keyMapFor = over; }
  return keyMap[combo] || null;
}

function reloadCurrent() {
  const t = cur();
  if (!t) return false;
  d.tabs.reload();
  d.tabs.pushTab(t);
  return true;
}

function hostToggle(fn) {
  const t = cur();
  if (!t || !t.host) return false;
  const h = t.host, p = d.prefs;
  if (fn === "shield") p.setTrusted(h, !p.isTrusted(h));
  else if (fn === "lite") p.toggleLite(h);
  else if (fn === "compat") { if (p.isForcedCompat(h)) return false; p.setCompat(h, !p.isCompat(h)); }
  return reloadCurrent();
}

function toggleDesktop() {
  const t = cur();
  if (!t) return false;
  t.desktop = t.desktop === false;
  applyAgent(t, curWc());
  d.tabs.persist();
  return reloadCurrent();
}

async function engineSuggest(text) {
  const eng = d.prefs.ENGINES[d.prefs.p.search];
  if (!eng?.suggest || cur()?.private || text.length < 2) return [];
  try {
    const r = await net.fetch(eng.suggest.replace("%s", encodeURIComponent(text)), { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return [];
    const j = await r.json();
    const list = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
    return list.filter(s => typeof s === "string" && s).slice(0, 5)
      .map(s => ({ title: s, url: d.prefs.resolve(s, d.relay.available) }));
  } catch { return []; }
}

async function suggest(text) {
  text = str(text).trim();
  if (!text) return [];
  const hist = cur()?.private || !d.prefs.p.historySuggest ? [] : d.history.suggest(text).map(h => h.search ? { title: h.title, url: d.prefs.resolve(h.title, d.relay.available), search: true } : h);
  const seen = new Set(hist.map(h => h.url));
  const eng = (await engineSuggest(text)).filter(s => !seen.has(s.url));
  return hist.concat(eng).slice(0, 10);
}

function find(text, forward) {
  const wc = curWc();
  if (!wc) return false;
  text = str(text);
  if (!text) { wc.stopFindInPage("clearSelection"); d.ui.push("find", { cur: 0, total: 0 }); return true; }
  wc.findInPage(text, { forward: forward !== false, findNext: false });
  return true;
}

function closePreview() {
  if (!preview) return false;
  const v = preview;
  preview = null;
  try { d.win().contentView.removeChildView(v); } catch { /* window gone */ }
  if (!v.webContents.isDestroyed()) v.webContents.close();
  return true;
}

function openPreview(url, rect) {
  if (!isWeb(url) || !rect) return false;
  closePreview();
  previewPrivate = !!cur()?.private;
  const v = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, session: curSession() } });
  v.setBackgroundColor("#ffffff");
  v.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  applyAgent(cur(), v.webContents);
  const r = k => Math.max(0, Math.round(Number(rect[k]) || 0));
  v.setBounds({ x: r("x"), y: r("y"), width: Math.max(r("width"), 50), height: Math.max(r("height"), 50) });
  d.win().contentView.addChildView(v);
  v.webContents.loadURL(url).catch(() => {});
  preview = v;
  return true;
}

function promotePreview() {
  if (!preview) return false;
  const url = preview.webContents.getURL();
  closePreview();
  if (!isWeb(url)) return false;
  d.tabs.create({ url, private: previewPrivate });
  return true;
}

async function clearSiteData() {
  for (const ses of [session.defaultSession, session.fromPartition("lodica-private")]) {
    await ses.clearStorageData().catch(() => {});
    await ses.clearCache().catch(() => {});
  }
  d.ui.toast("Site data cleared");
  return true;
}

function initPayload() {
  const t = cur(), o = d.tabs.open();
  return {
    prefs: d.prefs.p, engines: d.prefs.ENGINES, agents: d.prefs.AGENTS, languages: d.prefs.LANGUAGES,
    qualities: d.prefs.QUALITIES, tab: d.tabs.info(t),
    tabs: { count: o.filter(x => !x.private).length, privateCount: o.filter(x => x.private).length },
    version: app.getVersion(), chromium: process.versions.chrome, ghostery: d.net.VERSION,
    relay: { available: !!d.relay.available, domain: d.relay.DOMAIN }, ai: d.ai.status(),
    locked: d.tabs.isLocked() && o.some(x => x.private), pinSet: d.vault.pinSet(),
  };
}

function init(deps) {
  d = deps;
  const { ui, tabs, prefs, helper, relay, room, history, vault, ai, meter, downloads, pctabs, remind, webapps, perms, serial, updater, extensions } = d;
  const on = (cmd, fn) => ui.handle(cmd, fn);
  const host = () => cur()?.host || "";

  on("init", initPayload);
  on("go", text => tabs.go(text));
  on("back", () => tabs.back());
  on("forward", () => tabs.forward());
  on("reload", hard => tabs.reload(!!hard));
  on("stop", () => tabs.stop());
  on("osk", () => openKeyboard());
  on("key.act", id => runKey(str(id)));
  on("keys.list", () => ({ actions: keys.list(prefs.p.keybinds), map: keys.map(prefs.p.keybinds) }));
  on("keys.bind", (id, combos) => { prefs.set("keybinds", keys.bind(prefs.p.keybinds, str(id), combos)); return keys.list(prefs.p.keybinds); });
  on("keys.reset", id => {
    const o = { ...(prefs.p.keybinds || {}) };
    if (id) delete o[str(id)]; else for (const k of Object.keys(o)) delete o[k];
    prefs.set("keybinds", o);
    return keys.list(o);
  });
  on("home", () => tabs.home());

  on("tab.new", (o = {}) => tabs.create({ url: isWeb(o?.url) || str(o?.url).startsWith("lodica:") ? o.url : undefined, private: !!o?.private, background: !!o?.background }));
  on("tab.select", id => tabs.select(str(id)));
  on("tab.close", id => tabs.close(id == null ? cur()?.id : str(id)));
  on("tab.undoClose", () => tabs.undoClose());
  // Middle click on a tab: closes that tab by default, else the configured action.
  on("tab.middle", id => {
    const act = (d.prefs.p.mouse || {}).middle || "closeTab";
    if (act === "closeTab") tabs.close(str(id)); else mouse("middle");
  });
  on("tab.split", id => (id == null ? tabs.toggleSplit() : tabs.splitWith(str(id))));
  on("split.close", () => tabs.endSplit());
  on("split.ratio", r => tabs.setSplitRatio(Number(r)));
  // Divider drag: screenX of the pointer -> ratio of the page area.
  on("split.drag", x => {
    const r = d.ui.pageBounds(), c = d.win().getContentBounds();
    const sx = Number(x);
    return tabs.setSplitRatio((sx - c.x - r.x - 7) / Math.max(1, r.width - 14));
  });
  on("tab.menu", id => {
    const t = tabs.all().find(x => x.id === str(id));
    if (!t) return false;
    const others = tabs.all().filter(x => x !== t && !x.archived && x.private === t.private);
    const clip = s => (s.length > 40 ? s.slice(0, 39) + "\u2026" : s) || "New tab";
    const items = [];
    if (tabs.isSplit() && tabs.info(t).split) {
      items.push({ label: "End split", click: () => tabs.endSplit() });
    } else {
      items.push({
        label: "Split with\u2026",
        submenu: [
          { label: "New tab", click: () => { tabs.select(t.id); tabs.splitWith(); } },
          ...(others.length ? [{ type: "separator" }] : []),
          ...others.slice(0, 15).map(o => ({ label: clip(str(o.title || o.url)), click: () => { tabs.select(t.id); tabs.splitWith(o.id); } })),
        ],
      });
    }
    items.push({ type: "separator" }, { label: "Reload", click: () => { tabs.select(t.id); tabs.reload(); } }, { label: "Close tab", click: () => tabs.close(t.id) });
    Menu.buildFromTemplate(items).popup({ window: d.win() });
    return true;
  });
  on("tab.closeAll", priv => tabs.closeAll(!!priv));
  on("tab.list", () => tabs.listing());
  on("tab.thumb", id => tabs.thumb(str(id)).catch(() => null));
  on("tab.archive", id => tabs.archive(str(id)));
  on("tab.restore", id => tabs.restore(str(id)));
  on("tab.deleteArchived", id => tabs.deleteArchived(str(id)));
  on("tab.clearArchived", () => tabs.clearArchived());
  on("tab.reopen", i => tabs.reopen(Number(i) || 0));

  on("find", (text, forward) => find(text, forward));
  on("find.stop", () => find(""));
  on("suggest", suggest);
  on("topSites", () => history.topSites());
  on("prefs.set", (k, v) => { prefs.set(str(k), v); return true; });
  on("prefs.all", () => prefs.p);
  on("bg.pick", async () => {
    const { dialog } = require("electron");
    const fs = require("fs"), path = require("path");
    const r = await dialog.showOpenDialog(d.win(), { title: "Choose a start page background", properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif"] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    if (fs.statSync(src).size > 8 * 1024 * 1024) { d.ui.toast("Image is larger than 8 MB"); return null; }
    const dir = path.join(app.getPath("userData"), "bg");
    fs.mkdirSync(dir, { recursive: true });
    const name = "custom-" + Date.now() + path.extname(src).toLowerCase();
    fs.copyFileSync(src, path.join(dir, name));
    // Remember the last few wallpapers so they can be picked again.
    const hist = [name, ...(prefs.p.bgHistory || []).filter((n) => n !== name)];
    for (const old of hist.splice(8)) fs.rmSync(path.join(dir, old), { force: true });
    prefs.set("bgHistory", hist);
    prefs.set("bg", { ...prefs.p.bg, type: "custom", value: name });
    return name;
  });
  on("bg.forget", (name) => {
    const fs = require("fs"), path = require("path");
    const n = str(name);
    if (!/^custom-[\w.-]+$/.test(n)) return false;
    fs.rmSync(path.join(app.getPath("userData"), "bg", n), { force: true });
    prefs.set("bgHistory", (prefs.p.bgHistory || []).filter((x) => x !== n));
    if (prefs.p.bg && prefs.p.bg.value === n) prefs.set("bg", { ...prefs.p.bg, type: "none", value: "" });
    return true;
  });

  on("shield.toggle", () => hostToggle("shield"));
  on("lite.toggle", () => hostToggle("lite"));
  on("compat.toggle", () => hostToggle("compat"));
  on("desktop.toggle", toggleDesktop);

  on("share", (url, raw) => {
    const u0 = str(url) || cur()?.url || "";
    const u = raw ? u0 : cleanUrl(u0);
    if (!u) return false;
    clipboard.writeText(u);
    ui.toast("Link copied");
    return true;
  });
  on("copyLink", url => { clipboard.writeText(cleanUrl(url)); return true; });
  on("copy", text => { clipboard.writeText(str(text)); return true; });
  on("openExternal", url => {
    if (!/^(https?|mailto|tel):/i.test(str(url))) return false;
    shell.openExternal(str(url)).catch(() => {});
    return true;
  });
  on("email.hide", () => {
    const t = cur();
    const h = (t && t.host || "").replace(/^www\./, "");
    if (!h) return false;
    const list = d.prefs.p.noDummy;
    d.prefs.set("noDummy", list.includes(h) ? list.filter(x => x !== h) : list.concat(h));
    t.emailForm = false; t.emailFocus = false;
    d.tabs.pushTab(t);
    return true;
  });
  // Custom theme: four colours, saved with a timestamp so the relay can sync it to the other devices.
  const HEX = /^#[0-9a-f]{6}$/i;
  const pullTheme = async () => {
    const r = await relay.syncTheme(d.prefs.p.customTheme);
    if (r && ["bg", "text", "accent", "accent2"].every(k => HEX.test(r[k]))) d.prefs.set("customTheme", r);
  };
  relay.setOnRefresh(pullTheme);
  setTimeout(pullTheme, 3000).unref?.();
  setInterval(pullTheme, 10 * 60 * 1000).unref?.();
  on("theme.custom", async (c) => {
    if (c === null) { d.prefs.set("customTheme", null); return true; }
    if (!c || !["bg", "text", "accent", "accent2"].every(k => HEX.test(c[k]))) return false;
    d.prefs.set("customTheme", { bg: c.bg, text: c.text, accent: c.accent, accent2: c.accent2, at: Date.now() });
    d.prefs.set("theme", "custom");
    pullTheme();
    return true;
  });
  on("email.fill", () => (cur() ? helper.fill(cur()) : false));
  on("reader", () => (cur() ? helper.reader(cur()) : null));

  on("relay.state", () => relay.state);
  on("relay.link", async (domain, token) => { const r = await relay.link(str(domain), str(token)); if (r.ok) require("./net").applyProxy(); return r; });
  on("relay.unlink", () => { const r = relay.unlink(); require("./net").applyProxy(); return r; });
  on("relay.info", () => relay.linked());
  on("relay.refresh", () => { relay.refresh(); return true; });
  on("room.start", () => room.start());
  on("room.stop", () => { room.stop(); return true; });
  on("room.send", text => room.send(str(text)));
  on("room.name", name => room.setName(str(name)));
  on("relay.delete", id => relay.deleteMail(id));
  on("relay.forget", address => relay.forget(str(address)));

  on("remind.set", ts => remind.set(ts));
  on("video.speed", v => {
    const n = Number(v);
    if (!(n > 0 && n <= 4)) return false;
    prefs.set("speed", n); helper.pushPage();
    return true;
  });
  on("video.quality", v => {
    if (!host()) return false;
    prefs.setQuality(host(), v == null ? null : Number(v) || null); helper.pushPage();
    return true;
  });

  on("history.list", q => history.list(str(q)));
  on("history.delete", url => history.delete(str(url)));
  on("history.clear", () => history.clear());
  on("history.clearSuggest", () => { history.clearSearches(); return true; });

  on("vault.state", () => vault.state());
  on("vault.setPin", pin => vault.setPin(str(pin)));
  on("vault.unlock", pin => vault.unlock(str(pin)));
  on("vault.list", () => vault.list());
  on("vault.delete", (origin, user) => vault.delete(str(origin), str(user)));
  on("vault.copy", (origin, user) => {
    const ok = vault.copy(str(origin), str(user));
    if (ok) ui.toast("Password copied");
    return ok;
  });

  on("update.status", () => updater.status());
  on("update.check", () => updater.check());
  on("update.download", () => updater.download());
  on("update.cancel", () => updater.cancel());
  on("update.install", () => updater.install());
  on("downloads.list", () => downloads.list());
  on("downloads.open", id => downloads.open(str(id)));
  on("downloads.show", id => downloads.show(str(id)));
  on("downloads.cancel", id => downloads.cancel(str(id)));
  on("downloads.resume", id => downloads.resume(str(id)));
  on("downloads.remove", id => downloads.remove(str(id)));
  on("downloads.clear", () => downloads.clear());

  on("meter.list", () => meter.list());
  on("meter.reset", () => { meter.reset(); return meter.list(); });

  on("ai.ask", (q, ctx) => ai.ask(str(q), str(ctx)));
  on("ai.status", () => ai.status());
  on("ai.chats", () => ai.chats.get());
  on("ai.chat.send", (id, text) => ai.chats.send(str(id), str(text)));
  on("ai.chat.delete", id => ai.chats.delete(str(id)));
  on("ai.setKey", k => ai.setKey(str(k)));
  on("ai.usage", () => ai.usage());
  on("ai.resetUsage", () => ai.resetUsage());
  on("ai.memory.get", () => ai.memory.get());
  on("ai.memory.set", text => ai.memory.set(str(text)));

  on("pctabs.link", () => pctabs.link());
  on("pctabs.reset", () => pctabs.reset());
  on("pctabs.pair", text => pctabs.pair(str(text)));
  on("pctabs.remote", async () => { await pctabs.refresh(); return pctabs.status(); });
  on("ext.list", () => extensions.list());
  on("ext.install", s => extensions.install(str(s)));
  on("ext.remove", id => extensions.remove(str(id)));
  on("ext.toggle", id => extensions.toggle(str(id)));
  on("webapps.install", () => webapps.install());
  on("webapps.list", () => webapps.list());
  on("webapps.open", id => webapps.open(str(id)));
  on("webapps.remove", id => webapps.remove(str(id)));

  on("privacy.clearSiteData", clearSiteData);
  on("privacy.resetPermissions", () => { perms.reset(); serial.reset(); ui.toast("Site permissions reset"); return true; });

  on("private.unlock", pin => {
    if (vault.pinSet() && !vault.check(str(pin))) return false;
    tabs.setLocked(false);
    return true;
  });
  on("private.lock", () => { tabs.setLocked(true); return true; });

  on("preview.open", (url, rect) => openPreview(str(url), rect));
  on("preview.close", closePreview);
  on("preview.promote", promotePreview);

  on("link.open", (url, priv) => {
    if (!isWeb(url)) return false;
    tabs.create({ url: str(url), private: priv == null ? !!cur()?.private : !!priv, background: true });
    return true;
  });
  on("link.download", url => (isWeb(url) ? (downloads.download(str(url), curSession()), true) : false));

  on("quit", () => { app.quit(); return true; });
  on("devtools", () => {
    const wc = curWc();
    if (wc && !wc.isDestroyed()) wc.openDevTools({ mode: "detach" });
    return !!wc;
  });
}

/** Run the action bound to a mouse button ("middle", "back", "forward"). */
function mouse(btn) {
  const act = Object.assign({ middle: "closeTab", back: "back", forward: "forward" }, d.prefs.p.mouse)[btn];
  if (act && act !== "none") runKey(act);
}

/** Top sites for the Lodica Search start page; none in private tabs. */
function topSitesFor() { return cur()?.private ? [] : d.history.topSites(); }

module.exports = { suggest, topSitesFor, init, applyAgent, closePreview, runKey, keyActionFor, mouse };
