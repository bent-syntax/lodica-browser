// Site permissions: ask once per site and remember (not for private tabs); HTTP auth prompts.
const { app, session, ipcMain, Notification, nativeImage, BrowserWindow } = require("electron");
const store = require("./store");

const ALLOW = new Set(["fullscreen", "clipboard-sanitized-write", "pointerLock", "mediaKeySystem", "persistent-storage", "screen-wake-lock", "serial", "usb", "hid", "fileSystem"]);
let saved = store.load("permissions", {}); // "host|key" -> true/false
const persist = () => store.save("permissions", () => saved);
const pending = new Map();
const temp = {}; // private tab answers, kept until the app quits
let ui = null, tabs = null;

const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const isPrivate = wc => !!wc && wc.session !== session.defaultSession;

function describe(permission, h, details) {
  switch (permission) {
    case "geolocation": return ["geo", `Share your location with ${h}?`];
    case "notifications": return ["notify", `Allow ${h} to send notifications?`];
    case "clipboard-read": return ["clipboard", `Let ${h} read your clipboard?`];
    case "display-capture": return ["screen", `Allow ${h} to see your screen?`];
    case "storage-access":
    case "top-level-storage-access": return ["storage", `Let an embedded site use cookies on ${h}?`];
    case "local-network-access":
    case "local-network":
    case "loopback-network": return ["local", `Allow ${h} to reach devices on your network?`];
    case "media": {
      const t = details?.mediaTypes || [];
      const cam = t.includes("video"), mic = t.includes("audio");
      if (!cam && !mic) return null;
      const what = [cam && "camera", mic && "microphone"].filter(Boolean).join(" and ");
      return [`media:${cam}:${mic}`, `Allow ${h} to use your ${what}?`];
    }
    default: return null;
  }
}

function ask(h, key, title, remember) {
  const id = h + "|" + key;
  if (id in saved) return Promise.resolve(saved[id]);
  if (!remember && id in temp) return Promise.resolve(temp[id]);
  if (pending.has(id)) return pending.get(id);
  const p = ui.prompt({ title, message: remember ? "Lodica remembers your choice for this site." : "", ok: "Allow", cancel: "Block" })
    .then(v => {
      const yes = v === true;
      if (remember) { saved[id] = yes; persist(); } else temp[id] = yes;
      return yes;
    })
    .catch(() => false)
    .finally(() => pending.delete(id));
  pending.set(id, p);
  return p;
}

function request(wc, permission, cb, details) {
  if (ALLOW.has(permission)) return cb(true);
  if (permission === "openExternal") {
    const url = String(details?.externalURL || "");
    if (!url) return cb(false);
    return ui.prompt({ title: "Open in another app?", message: url.slice(0, 200), ok: "Open", cancel: "Cancel" })
      .then(v => cb(v === true), () => cb(false));
  }
  const h = hostOf(details?.requestingUrl || wc?.getURL() || "");
  const d = h && describe(permission, h, details);
  if (!d) return cb(false);
  ask(h, d[0], d[1], !isPrivate(wc)).then(cb);
}

function check(wc, permission, origin, details) {
  if (ALLOW.has(permission)) return true;
  const h = hostOf(origin || details?.requestingUrl || "");
  const d = h && describe(permission, h, { mediaTypes: details?.mediaType ? [details.mediaType] : [] });
  if (!d) return false;
  if (permission === "media") return Object.keys(saved).some(k => k.startsWith(h + "|media:") && saved[k] === true);
  const id = h + "|" + d[0];
  return isPrivate(wc) ? (temp[id] ?? saved[id]) === true : saved[id] === true;
}

// Site notifications from the page shim in preload/content.js, shown as system notifications.
const shown = new Map(); // "wcId|id" -> Notification
const byTag = new Map(); // "wcId|host|tag" -> key in shown
async function iconOf(wc, url) {
  if (!/^https?:/.test(url || "")) return undefined;
  try {
    const r = await wc.session.fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 1 << 20) return undefined;
    const img = nativeImage.createFromBuffer(buf);
    return img.isEmpty() ? undefined : img.resize({ width: 64, height: 64 });
  } catch { return undefined; }
}
function emit(wc, id, type) { try { if (!wc.isDestroyed()) wc.send("pageNotify", { id, type }); } catch { /* tab gone */ } }
async function pageNotify(e, m) {
  const wc = e.sender;
  if (!m || typeof m !== "object" || !Notification.isSupported()) return;
  const id = Number(m.id) || 0;
  const key = wc.id + "|" + id;
  if (m.op === "close") { shown.get(key)?.close(); shown.delete(key); return; }
  if (m.op !== "show") return;
  const h = hostOf(e.senderFrame?.url || wc.getURL());
  const allowId = h + "|notify";
  if (!h || (isPrivate(wc) ? (temp[allowId] ?? saved[allowId]) : saved[allowId]) !== true) return emit(wc, id, "error");
  const tag = String(m.tag || "");
  if (tag) {
    const old = byTag.get(wc.id + "|" + h + "|" + tag);
    if (old) { shown.get(old)?.close(); shown.delete(old); }
    byTag.set(wc.id + "|" + h + "|" + tag, key);
  }
  const body = String(m.body || "").slice(0, 1000);
  const n = new Notification({
    title: String(m.title || h).slice(0, 200),
    body: body ? body + "\n" + h : h,
    silent: !!m.silent,
    icon: await iconOf(wc, String(m.icon || "")),
  });
  shown.set(key, n);
  n.on("click", () => {
    const t = tabs?.byContents?.(wc);
    const win = BrowserWindow.fromWebContents?.(wc) || BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    if (t) tabs.select(t.id);
    emit(wc, id, "click");
  });
  n.on("close", () => { if (shown.get(key) === n) { shown.delete(key); emit(wc, id, "close"); } });
  n.show();
}

/** Remembered answers for the settings list: [{ host, kind, allow }]. */
function list() {
  return Object.entries(saved).map(([k, v]) => {
    const i = k.indexOf("|");
    return { host: k.slice(0, i), kind: k.slice(i + 1), allow: v === true };
  }).sort((a, b) => a.host.localeCompare(b.host) || a.kind.localeCompare(b.kind));
}
/** Changes one remembered answer: true/false sets it, null forgets it so the site asks again. */
function set(host, kind, allow) {
  const id = String(host || "") + "|" + String(kind || "");
  if (!(id in saved) && allow == null) return false;
  if (allow == null) delete saved[id]; else saved[id] = allow === true;
  delete temp[id];
  persist();
  return true;
}

function login(e, wc, details, authInfo, cb) {
  if (authInfo.isProxy) return;
  e.preventDefault();
  const h = authInfo.host || hostOf(details?.url || "");
  ui.prompt({ kind: "auth", title: `Sign in to ${h}`, message: authInfo.realm ? String(authInfo.realm).slice(0, 120) : "", ok: "Sign in" })
    .then(v => (v && typeof v === "object" && v.user != null ? cb(String(v.user), String(v.pass || "")) : cb()), () => cb());
}

function init(d) {
  ui = d.ui;
  tabs = d.tabs;
  ipcMain.on("pageNotify", (e, m) => { pageNotify(e, m).catch(() => {}); });
  for (const ses of d.sessions) {
    ses.setPermissionRequestHandler(request);
    ses.setPermissionCheckHandler(check);
  }
  app.on("login", login);
}

function reset() { saved = {}; for (const k of Object.keys(temp)) delete temp[k]; persist(); return true; }

module.exports = { init, reset, list, set };
