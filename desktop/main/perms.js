// Site permissions: ask once per site and remember (not for private tabs); HTTP auth prompts.
const { app, session } = require("electron");
const store = require("./store");

const ALLOW = new Set(["fullscreen", "clipboard-sanitized-write", "pointerLock", "mediaKeySystem", "persistent-storage", "screen-wake-lock", "serial", "usb", "hid"]);
let saved = store.load("permissions", {}); // "host|key" -> true/false
const persist = () => store.save("permissions", () => saved);
const pending = new Map();
let ui = null;

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
  if (pending.has(id)) return pending.get(id);
  const p = ui.prompt({ title, message: remember ? "Lodica remembers your choice for this site." : "", ok: "Allow", cancel: "Block" })
    .then(v => {
      const yes = v === true;
      if (remember) { saved[id] = yes; persist(); }
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
  return saved[h + "|" + d[0]] === true;
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
  for (const ses of d.sessions) {
    ses.setPermissionRequestHandler(request);
    ses.setPermissionCheckHandler(check);
  }
  app.on("login", login);
}

function reset() { saved = {}; persist(); return true; }

module.exports = { init, reset };
