// Renderer commands (see IPC.md), registered on the ui dispatcher.
const keys = require("./keys");
const { systemAccent } = require("./sysaccent");
let sysAccentCache;
const { app, clipboard, shell, session, net, WebContentsView, Menu, screen } = require("electron");

const PANEL_W = 360;
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
const UI_ACTIONS = new Set(["address", "find", "switcher", "menu", "settings", "history", "downloads", "notebook", "chat", "assistant"]);

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
  // Lodica Search has no suggestions of its own: use the fallback engine chosen in Settings.
  const key = d.prefs.p.search;
  const eng = d.prefs.ENGINES[!key || key === "LODICA" ? d.prefs.p.searchFallback : key] || d.prefs.ENGINES.DUCKDUCKGO;
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
  const top = hist.find(h => !h.search && /^https:\/\//.test(h.url || ""));
  if (top) try { curWc()?.session.preconnect({ url: top.url, numSockets: 1 }); } catch { /* no session */ }
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
    version: require("../package.json").lodicaVersion || app.getVersion(), chromium: process.versions.chrome, ghostery: d.net.VERSION,
    relay: { available: !!d.relay.available, domain: d.relay.DOMAIN }, ai: d.ai.status(),
    locked: d.tabs.isLocked() && o.some(x => x.private), pinSet: d.vault.pinSet(),
  };
}

function init(deps) {
  d = deps;
  const { ui, tabs, prefs, helper, relay, room, history, vault, ai, meter, downloads, pctabs, remind, webapps, perms, serial, updater, extensions, support } = d;
  const on = (cmd, fn) => ui.handle(cmd, fn);
  const host = () => cur()?.host || "";

  on("init", initPayload);
  on("theme.colors", c => {
    const ok = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
    if (!c || !ok(c.bg) || !ok(c.amber) || !ok(c.text)) return;
    global.lodicaTheme = { bg: c.bg, amber: c.amber, text: c.text }; // read by the page preloads (swipe arrow)
    const { nativeImage } = require("electron");
    require("./logo").renderAsync(128, { bg: c.bg, amber: c.amber, text: c.text })
      .then(png => {
        if (!png) return;
        const img = nativeImage.createFromBuffer(png);
        if (img.isEmpty()) return;
        global.__lodicaIcon = img;
        tabs.setLogo(png);
        try { require("fs").writeFileSync(require("path").join(app.getPath("userData"), "theme-icon.png"), png); } catch {}
        const { BaseWindow } = require("electron");
        for (const w of BaseWindow.getAllWindows()) {
          try { if (!w.isDestroyed()) w.setIcon(img); } catch (e) { console.error("setIcon failed:", e && e.message); }
        }
        if (process.platform === "darwin" && app.dock) { try { app.dock.setIcon(img); } catch {} }
      })
      .catch(e => console.error("theme icon failed:", e && e.message));
  });
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
  on("tab.move", (id, to) => tabs.move(str(id), str(to)));
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
  on("prefs.all", () => Object.assign({}, prefs.p, { sysAccent: sysAccentCache ??= systemAccent() }));
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
    let u = raw ? u0 : cleanUrl(u0);
    if (u0.startsWith("lodica://search/")) {
      // Lodica Search pages are local to this app: share the same query on a public engine.
      const q = new URL(u0.replace("lodica://", "http://x/")).searchParams.get("q");
      if (q) {
        const eng = prefs.p.search && prefs.p.search !== "LODICA" ? prefs.p.search : prefs.p.searchFallback;
        u = prefs.ENGINES[eng].query.replace("%s", encodeURIComponent(q));
      }
    }
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
  on("theme.custom", async (c, use) => {
    if (c === null) { d.prefs.set("customTheme", null); return true; }
    if (!c || !["bg", "text", "accent", "accent2"].every(k => HEX.test(c[k]))) return false;
    const out = { bg: c.bg, text: c.text, accent: c.accent, accent2: c.accent2, at: Date.now() };
    for (const k of ["raised", "high", "muted"]) if (HEX.test(c[k])) out[k] = c[k];
    d.prefs.set("customTheme", out);
    if (use) d.prefs.set("theme", "custom"); // colour edits alone never switch the theme
    pullTheme();
    return true;
  });
  // Make a custom theme from a description (for example "Minecraft") with the linked AI.
  on("theme.ai", async (idea) => {
    const what = str(idea).trim().slice(0, 200);
    if (!what) return { error: "Describe the theme first" };
    let reply;
    try { reply = await d.ai.complete([{ role: "user", content: "Theme: " + what }], require("./aitheme").SYSTEM); }
    catch (e) { return { error: /connect/i.test(String(e && e.message)) ? "Connect the AI in Settings first" : "The AI could not answer" }; }
    const t = require("./aitheme").parse(reply);
    if (!t) return { error: "The AI gave no usable colours. Try again" };
    d.prefs.set("customTheme", Object.assign(t, { at: Date.now() }));
    d.prefs.set("theme", "custom");
    pullTheme();
    return { ok: true };
  });
  // Community theme plugins (see themeplugins.js).
  const tp = require("./themeplugins");
  on("plugins.list", () => tp.list().map(({ css, ...p }) => p));
  on("plugins.active", () => tp.get(d.prefs.p.themePlugin));
  on("plugins.use", (id) => { d.prefs.set("themePlugin", id && tp.get(id) ? String(id) : ""); return true; });
  on("plugins.open", () => shell.openPath(tp.folder()));
  // Holiday themes: claimable for a week either side of the holiday, then yours for good.
  const holidays = require("./holidays");
  on("holiday.list", () => holidays.list(d.prefs.p.claimedThemes));
  on("holiday.claim", (id) => {
    const have = d.prefs.p.claimedThemes;
    if (have.includes(id)) return true;
    if (!holidays.canClaim(id)) return false;
    d.prefs.set("claimedThemes", have.concat(id));
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
  on("room.select", r => room.select(str(r)));
  on("room.open", (kind, target) => { const r = kind === "group" ? room.group(str(target)) : room.dm(str(target)); room.addChat(r); return room.select(r); });
  on("room.upload", async () => {
    const { dialog } = require("electron");
    const r = await dialog.showOpenDialog(d.win(), { title: "Send a file to this chat (max 5 GB)", properties: ["openFile"] });
    if (r.canceled || !r.filePaths[0]) return null;
    return room.upload(r.filePaths[0]);
  });
  on("room.preview", id => room.fetchFile(str(id)));
  on("room.save", async (id, name) => {
    const { dialog } = require("electron");
    const r = await dialog.showSaveDialog(d.win(), { title: "Save attachment", defaultPath: room.safeName(str(name)) });
    if (r.canceled || !r.filePath) return null;
    return (await room.fetchFile(str(id), r.filePath)) ? true : false;
  });
  on("room.remove", r => room.removeChat(str(r)));
  on("room.discover", () => room.discover());
  on("room.users", () => room.users());
  on("notebook.list", () => require("./notebook").list());
  on("notebook.get", (id) => require("./notebook").get(str(id)));
  on("notebook.create", () => require("./notebook").create());
  on("notebook.remove", (id) => require("./notebook").remove(str(id)));
  on("notebook.put", (id, text, base) => require("./notebook").put(str(id), str(text), base));
  on("screen.frame", (after) => require("./screen").frame(after));
  on("screen.stop", () => require("./screen").stop());
  on("screen.input", (events) => require("./screen").input(Array.isArray(events) ? events : []));
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

  const authOk = () => !vault.pinSet() || vault.state().unlocked;
  on("auth.list", () => (authOk() ? require("./totp").list() : []));
  on("auth.add", text => (authOk() ? require("./totp").add(str(text)) : 0));
  on("auth.addImage", async () => {
    if (!authOk()) return { added: 0, error: "Locked" };
    const { dialog } = require("electron");
    const r = await dialog.showOpenDialog(d.win(), { title: "Choose a screenshot of the QR code", properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    return require("./totp").addImage(r.filePaths[0]);
  });
  on("auth.remove", id => (authOk() ? require("./totp").remove(str(id)) : false));
  on("auth.rename", (id, label) => (authOk() ? require("./totp").rename(str(id), str(label)) : false));
  on("auth.setHost", (id, host) => (authOk() ? require("./totp").setHost(str(id), str(host)) : false));
  on("auth.copy", id => {
    const c = authOk() ? require("./totp").copy(str(id)) : null;
    if (c) clipboard.writeText(c);
    return !!c;
  });

  on("support.open", () => support.open());
  on("support.linkStart", (email) => support.linkStart(str(email).slice(0, 120).trim()));
  on("support.linkVerify", (email, code) => support.linkVerify(str(email).slice(0, 120).trim(), str(code).slice(0, 12).trim()));
  on("support.unlink", () => support.unlink());
  on("support.send", (text, o) => support.send(str(text).slice(0, 4000).trim(), o && Array.isArray(o.images) ? o.images.filter(x => typeof x === "string").slice(0, 3) : [], !!(o && o.resolved)));
  on("update.status", () => updater.status());
  on("notes.get", () => { try { return require("fs").readFileSync(require("path").join(app.getAppPath(), "PATCH_NOTES.md"), "utf8"); } catch { return ""; } });
  on("update.check", () => updater.check());
  on("update.versions", () => updater.versions());
  on("update.pick", tag => updater.pickVersion(str(tag)));
  on("update.download", () => updater.download());
  on("update.cancel", () => updater.cancel());
  on("update.install", () => updater.install());
  on("downloads.list", () => downloads.list());
  on("downloads.open", id => downloads.open(str(id)));
  on("downloads.show", id => downloads.show(str(id)));
  on("downloads.pause", id => downloads.pause(str(id)));
  on("downloads.cancel", id => downloads.cancel(str(id)));
  on("downloads.resume", id => downloads.resume(str(id)));
  on("downloads.remove", id => downloads.remove(str(id)));
  on("downloads.clear", () => downloads.clear());

  on("meter.list", () => meter.list());
  on("meter.reset", () => { meter.reset(); return meter.list(); });

  on("ai.ask", (q, ctx) => ai.ask(str(q), str(ctx)));
  on("ai.pageCtx", async () => {
    const t = cur(); if (!t || !t.view || t.view.webContents.isDestroyed() || !/^https?:/i.test(t.view.webContents.getURL())) return "";
    try {
      const wc = t.view.webContents;
      const body = await wc.executeJavaScript("(() => { const s = String(getSelection()); return (s ? 'Selected text:\\n' + s.slice(0, 4000) + '\\n\\n' : '') + (document.body ? document.body.innerText : '').slice(0, 9000); })()", true);
      return ("URL: " + wc.getURL() + "\nTitle: " + wc.getTitle() + "\n\n" + String(body || "")).slice(0, 12000);
    } catch { return ""; }
  });
  on("ai.agent.start", (goal) => {
    if (!d.ai.status().connected) return { error: "AI is not connected" };
    return require("./aiagent").start(str(goal), { tabs: d.tabs, ai: d.ai, push: (p) => d.ui.push("agent", p) });
  });
  on("ai.agent.stop", () => require("./aiagent").stop());
  on("ai.agent.active", () => require("./aiagent").active());
  // Right-hand AI panel (phone-shaped). "open" shows it; "full" swaps it for the full chat page.
  const panelShow = on_ => {
    if (!d.ai.status().connected) { d.ui.push("toast", { text: "Ask AI isn't set up" }); return false; }
    d.ui.setPanelWidth(on_ ? PANEL_W : 0); d.tabs.fit();
    d.ui.push("aipanel", { open: !!on_ });
    return !!on_;
  };
  on("ai.panel.toggle", () => panelShow(!d.ui.panelWidth()));
  on("ai.panel.open", () => panelShow(true));
  on("ai.panel.close", () => panelShow(false));
  on("ai.panel.full", () => { panelShow(false); d.ui.push("sheet", { name: "aichat" }); return true; });
  on("ai.status", () => ai.status());
  on("ai.chats", () => ai.chats.get());
  on("ai.chat.send", (id, text) => ai.chats.send(str(id), str(text)));
  on("ai.chat.delete", id => ai.chats.delete(str(id)));
  on("ai.chat.dir", () => ai.chats.dir());
  on("ai.chat.pickDir", async (reset) => {
    if (reset) { ai.chats.setDir(""); return ""; }
    const { dialog } = require("electron");
    const r = await dialog.showOpenDialog(d.win(), { title: "Choose where AI chats are saved", defaultPath: ai.chats.dir() || undefined, properties: ["openDirectory", "createDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    ai.chats.setDir(r.filePaths[0]);
    return r.filePaths[0];
  });
  // Connecting a provider also switches Ask AI on; it stays off for people who never connect.
  const enable = r => { if (r && !prefs.p.ai && ai.status().connected) prefs.set("ai", true); return r; };
  on("ai.setKey", k => enable(ai.setKey(str(k))));
  on("ai.setHearth", async (a, k) => enable(await ai.setHearth(str(a), str(k))));
  on("ai.usage", () => ai.usage());
  on("ai.resetUsage", () => ai.resetUsage());
  on("ai.memory.get", () => ai.memory.get());
  on("ai.memory.set", text => ai.memory.set(str(text)));

  on("pctabs.link", () => pctabs.link());
  on("pctabs.reset", () => pctabs.reset());
  on("pctabs.code", () => pctabs.pairCode());
  on("pctabs.pairCode", code => pctabs.pairWithCode(str(code)));
  // Linked devices: what to share, and the link key that protects passwords, authenticator keys and Wi-Fi passwords.
  const ld = require("./linkdata");
  on("link.cats", () => ({
    cats: ld.CATS.filter(c => !c.platform || c.platform === process.platform).map(c => ({ id: c.id, label: c.label, note: c.note, locked: !!c.locked, on: !!(prefs.p.linkShare || {})[c.id] })),
    key: pctabs.keyStatus(), bluetooth: pctabs.status().bluetooth || [], keyMissing: !!pctabs.status().keyMissing,
  }));
  on("link.sel", (id, v) => { if (!ld.CATS.some(c => c.id === str(id))) return false; prefs.set("linkShare", { ...prefs.p.linkShare, [str(id)]: !!v }); return true; });
  on("link.key.create", () => pctabs.createKey());
  on("link.key.save", async cable => {
    const { dialog } = require("electron");
    const r = await dialog.showSaveDialog(d.win(), { title: cable ? "Save the key file to carry over a cable" : "Save the key file", defaultPath: "lodica-key.lkey", filters: [{ name: "Lodica key", extensions: ["lkey"] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    require("fs").writeFileSync(r.filePath, pctabs.makeKeyFile(!!cable), { mode: 0o600 });
    return { ok: true, path: r.filePath, cable: !!cable };
  });
  on("link.key.insert", async () => {
    const { dialog } = require("electron"), fs = require("fs");
    const r = await dialog.showOpenDialog(d.win(), { title: "Choose the key file", properties: ["openFile"], filters: [{ name: "Lodica key", extensions: ["lkey"] }] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    if (fs.statSync(r.filePaths[0]).size > 64 * 1024) return { error: "That is not a key file" };
    return pctabs.insertKeyFile(fs.readFileSync(r.filePaths[0], "utf8"));
  });
  on("link.key.enter", code => pctabs.enterKeyCode(str(code)));
  on("link.key.forget", () => { pctabs.forgetKey(); return true; });
  on("pctabs.control", (type, url) => pctabs.control({ type: str(type), url: str(url) }));
  const listEmojis = async () => {
    if (!relay.available) return [];
    try {
      const r = await fetch(`${relay.API}/api/emojis`, { headers: { Authorization: "Bearer " + relay.token }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return [];
      const j = await r.json();
      return (Array.isArray(j) ? j : []).filter(e => e && !e.del && /^[a-z0-9_]{1,32}$/.test(e.name) && typeof e.png === "string" && e.png.length < 700000)
        .map(e => ({ name: e.name, png: e.png, at: e.at }));
    } catch { return []; }
  };
  on("emojis.list", listEmojis);
  require("./emojipicker").setSource(listEmojis);
  on("emojis.copy", async name => {
    const { nativeImage } = require("electron");
    const list = await listEmojis();
    const e = list.find(x => x.name === str(name));
    if (!e) return false;
    clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(e.png, "base64")));
    return true;
  });
  // Add a server emoji: pick a PNG or JPEG, shrink it to fit the relay's size cap, upload it under a name.
  on("emojis.add", async name => {
    const n = str(name).toLowerCase();
    if (!/^[a-z0-9_]{1,32}$/.test(n)) return { error: "Name: 1 to 32 letters, digits or _" };
    if (!relay.available) return { error: "Link a Lodica server first" };
    const { dialog, nativeImage } = require("electron");
    const r = await dialog.showOpenDialog(d.win(), { title: "Choose an emoji image", properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    let img = nativeImage.createFromPath(r.filePaths[0]);
    if (img.isEmpty()) return { error: "Could not read that image" };
    const { width, height } = img.getSize();
    // Plain backgrounds (white or any flat colour around the picture) become transparent.
    const bmp = Buffer.from(img.toBitmap());
    if (require("./emojibg").removeBackground(bmp, width, height)) img = nativeImage.createFromBitmap(bmp, { width, height });
    let side = 256, png = ""; // 256 px keeps a sent emoji sharp (Snapchat showed 128 px ones blurry); smaller only when the 96 KB server cap needs it
    for (let i = 0; i < 5; i++, side = Math.round(side * 0.75)) {
      const k = Math.min(1, side / Math.max(width, height));
      png = img.resize({ width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), quality: "best" }).toPNG().toString("base64");
      if (png.length <= 96 * 1024) break;
    }
    if (png.length > 96 * 1024) return { error: "Image too big" };
    return uploadEmoji(n, png);
  });
  async function uploadEmoji(n, png) {
    try {
      const res = await fetch(`${relay.API}/api/emojis`, { method: "POST", headers: { Authorization: "Bearer " + relay.token, "Content-Type": "application/json" }, body: JSON.stringify({ name: n, png, at: Date.now() }), signal: AbortSignal.timeout(20000) });
      if (!res.ok) return { error: res.status === 409 ? "Emoji limit reached" : "Server said " + res.status };
    } catch { return { error: "Server not reachable" }; }
    return { ok: true, name: n };
  }
  // Same Apple-style prompt as the phone: the AI draws an SVG, a hidden window renders it to a 256 px PNG.
  const EMOJI_STYLE = "You draw emoji in the style of Apple's emoji: polished, friendly, rounded 3D-looking shapes. " +
    "Reply with one complete SVG and nothing else. viewBox=\"0 0 64 64\", the subject fills most of the canvas, centred, transparent background. " +
    "Use defs with linearGradient and radialGradient for every main surface: a lighter top-left and a darker bottom-right shade of the same hue, " +
    "a soft white highlight shape (opacity .35 to .6) near the top-left, a subtle darker rim or shadow shape at the bottom, " +
    "a thin slightly darker outline (stroke-width 1 to 1.5) on the main shape, and rich saturated colours. " +
    "Keep shapes smooth with curved paths. Add small details that make the subject recognisable. " +
    "Do not use filter, mask, clipPath, image, text, style, script, foreignObject or any external reference. Under 3500 characters.";
  async function svgToPng(svg) {
    const { BrowserWindow } = require("electron");
    const w = new BrowserWindow({ show: false, width: 256, height: 256, transparent: true, frame: false, webPreferences: { sandbox: true, javascript: false, offscreen: true } });
    try {
      const html = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><body style="margin:0;background:transparent">' +
        svg.replace(/<svg\b/, '<svg width="256" height="256"') + "</body>";
      await w.loadURL("data:text/html;base64," + Buffer.from(html).toString("base64"));
      await new Promise(r => setTimeout(r, 150));
      return (await w.webContents.capturePage()).toPNG().toString("base64");
    } finally { w.destroy(); }
  }
  on("emojis.draw", async (name, idea) => {
    const n = str(name).toLowerCase();
    if (!/^[a-z0-9_]{1,32}$/.test(n)) return { error: "Name: 1 to 32 letters, digits or _" };
    if (!relay.available) return { error: "Link a Lodica server first" };
    const what = str(idea).slice(0, 80).trim();
    if (!what) return { error: "Describe the emoji" };
    let text;
    try { text = await d.ai.complete([{ role: "user", content: "Emoji: " + what }], EMOJI_STYLE); } catch (e) { return { error: e?.message || "AI failed" }; }
    const a = text.indexOf("<svg"), b = text.lastIndexOf("</svg>");
    if (a < 0 || b < a) return { error: "No drawing returned" };
    let svg = text.slice(a, b + 6);
    if (/<\s*(script|foreignObject|image|style|iframe)\b|\bon\w+\s*=|href\s*=\s*["']?\s*(https?:|javascript:)/i.test(svg)) return { error: "The drawing used something not allowed" };
    let png;
    try { png = await svgToPng(svg); } catch { return { error: "Could not render the drawing" }; }
    if (png.length > 96 * 1024) {
      const { nativeImage } = require("electron");
      png = nativeImage.createFromBuffer(Buffer.from(png, "base64")).resize({ width: 128, height: 128, quality: "best" }).toPNG().toString("base64");
      if (png.length > 96 * 1024) return { error: "Image too big" };
    }
    const r = await uploadEmoji(n, png);
    return r.ok ? { ok: true, name: n, png } : r;
  });
  on("pctabs.remote", async () => { await pctabs.refresh(); return pctabs.status(); });
  on("ext.list", () => extensions.list());
  on("ext.install", s => extensions.install(str(s)));
  on("ext.local", async kind => {
    const { dialog } = require("electron");
    const folder = str(kind) === "folder";
    const r = await dialog.showOpenDialog(d.win(), folder ? { title: "Choose an unpacked extension folder", properties: ["openDirectory"] }
      : { title: "Choose an extension file", properties: ["openFile"], filters: [{ name: "Extensions", extensions: ["crx", "zip", "xpi"] }] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    return extensions.installLocal(r.filePaths[0], async (name, perms) => (await dialog.showMessageBox(d.win(), {
      type: "question", buttons: ["Install", "Cancel"], defaultId: 1, cancelId: 1, title: "Install extension",
      message: "Install " + name + "?", detail: perms.length ? "It asks for:\n" + perms.join("\n") : "It asks for no special permissions.",
    })).response === 0);
  });
  on("ext.scaffold", async () => {
    const { dialog, shell } = require("electron");
    const r = await dialog.showOpenDialog(d.win(), { title: "Choose where to create the extension folder", properties: ["openDirectory", "createDirectory"] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const dir = require("path").join(r.filePaths[0], "my-lodica-extension");
    const fs = require("fs");
    if (fs.existsSync(dir)) return { ok: false, error: "A folder named my-lodica-extension is already there" };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(require("path").join(dir, "manifest.json"), JSON.stringify({
      manifest_version: 3, name: "My extension", version: "1.0.0", description: "Describe what it does.",
      content_scripts: [{ matches: ["https://example.com/*"], js: ["content.js"], run_at: "document_idle" }],
    }, null, 2) + "\n");
    fs.writeFileSync(require("path").join(dir, "content.js"), "// Runs on pages that match the patterns in manifest.json.\ndocument.body.style.outline = \"4px solid #F59E0B\";\n");
    shell.showItemInFolder(dir);
    return { ok: true, dir };
  });
  on("ext.remove", id => extensions.remove(str(id)));
  on("ext.open", (id, anchor) => extensions.open(str(id), anchor));
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
