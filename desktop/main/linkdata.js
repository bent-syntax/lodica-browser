"use strict";
// What linked devices can share, in ten categories. Each device picks the ones it sends and accepts (Settings > Linked devices).
// Three of them (passwords, authenticator keys, Wi-Fi passwords) travel sealed under the link key (linkkey.js), so a device
// that is linked but holds no key cannot read them. collect() builds what goes into the encrypted blob, apply() takes in what
// the other device sent. The merge helpers are pure so they can be tested.
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CATS = [
  { id: "tabs", label: "Open tabs", note: "Shown in Settings on the other device" },
  { id: "history", label: "History", note: "Pages you visit appear on the other device too" },
  { id: "totp", label: "Authenticator keys", note: "Needs the link key", locked: true },
  { id: "passwords", label: "Passwords", note: "Needs the link key", locked: true },
  { id: "chatName", label: "Name in the server chat", note: "Both devices use the same chat name" },
  { id: "bluetooth", label: "Bluetooth devices", note: "The names of paired devices, shown on the other device" },
  { id: "wifi", label: "Wi-Fi networks and passwords", note: "Needs the link key. Windows only", locked: true, platform: "win32" },
  { id: "shortcuts", label: "Start page shortcuts", note: "The tiles under the search bar" },
  { id: "settings", label: "Settings and themes", note: "Look, language, search and blocking choices. Not links or keys" },
  { id: "sites", label: "Site lists", note: "Sites you allowed, sites that go direct, sites without the hidden-email button" },
];
const SETTINGS = ["theme", "customTheme", "language", "darkPages", "httpsOnly", "search", "searchFallback", "adBlockLevel", "cookieReject", "spell", "spellAuto",
  "spellLangs", "selTranslate", "translateAi", "chatScale", "chatEmojiScale", "uiBlur", "uiAlpha", "vertTabs", "barBottom", "bg"];
const LISTS = ["trusted", "compat", "direct", "noDummy"];

const str = (v, n = 300) => String(v == null ? "" : v).slice(0, n);

// ---- pure merges ----
/** Passwords: one per site and user name, the newer one wins. */
function mergePasswords(local, remote) {
  const out = new Map(local.map((e) => [e.origin + "\n" + e.user, e]));
  let changed = 0;
  for (const r of Array.isArray(remote) ? remote : []) {
    if (!r || typeof r.origin !== "string" || typeof r.pass !== "string" || !r.pass) continue;
    const e = { origin: str(r.origin, 500), user: str(r.user, 300), pass: str(r.pass, 500), saved: Number(r.saved) || 0 };
    const k = e.origin + "\n" + e.user, cur = out.get(k);
    if (!cur || (e.saved > (cur.saved || 0) && cur.pass !== e.pass)) { out.set(k, e); changed++; }
  }
  return { list: [...out.values()], changed };
}
/** Authenticator accounts: one per secret; an account the other device has is added, never replaced. */
function mergeTotp(local, remote, newId) {
  const have = new Set(local.map((a) => a.secret));
  const added = [];
  for (const r of Array.isArray(remote) ? remote : []) {
    if (!r || typeof r.secret !== "string" || !r.secret || have.has(r.secret)) continue;
    have.add(r.secret);
    added.push({ id: newId(), label: str(r.label, 80), issuer: str(r.issuer, 80), name: str(r.name, 80), secret: str(r.secret, 200), digits: Number(r.digits) || 6, period: Number(r.period) || 30, algo: str(r.algo, 10) || "SHA1", host: str(r.host, 200) });
  }
  return { list: local.concat(added), changed: added.length };
}
/** Plain lists of text: the union. */
function union(local, remote, max = 500) {
  const out = Array.isArray(local) ? local.slice() : [];
  const seen = new Set(out.map(String));
  let changed = 0;
  for (const v of Array.isArray(remote) ? remote : []) { const s = str(v, 300); if (s && !seen.has(s) && out.length < max) { seen.add(s); out.push(s); changed++; } }
  return { list: out, changed };
}
/** Start page shortcuts: the union by address. */
function mergeShortcuts(local, remote) {
  const out = Array.isArray(local) ? local.slice() : [], seen = new Set(out.map((t) => t && t.url));
  let changed = 0;
  for (const t of Array.isArray(remote) ? remote : []) {
    if (!t || !/^https?:\/\//i.test(String(t.url)) || seen.has(t.url) || out.length >= 24) continue;
    seen.add(t.url); out.push({ url: str(t.url, 500), title: str(t.title, 40) }); changed++;
  }
  return { list: out, changed };
}
/** Settings: only the known keys, and only values of the same kind as the local one. */
function pickSettings(source, current) {
  const out = {};
  for (const k of SETTINGS) if (source && k in source && typeof source[k] === typeof current[k] && (k !== "customTheme" || source[k] === null || typeof source[k] === "object")) out[k] = source[k];
  return out;
}

// ---- Windows: Wi-Fi and Bluetooth ----
const run = (file, args) => new Promise((resolve) => execFile(file, args, { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (e, out) => resolve(e ? null : String(out))));
const BAD_NAME = /[\u0000-\u001f"<>|]/;

async function wifiCollect() {
  if (process.platform !== "win32") return [];
  const names = [...String((await run("netsh", ["wlan", "show", "profiles"])) || "").matchAll(/All User Profile\s*:\s*(.+)/g)].map((m) => m[1].trim()).filter((n) => n && !BAD_NAME.test(n));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lodica-wifi-")), out = [];
  try {
    for (const name of names.slice(0, 40)) {
      await run("netsh", ["wlan", "export", "profile", "name=" + name, "key=clear", "folder=" + dir]);
      const file = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".xml"));
      if (!file) continue;
      const xml = fs.readFileSync(path.join(dir, file), "utf8");
      fs.rmSync(path.join(dir, file), { force: true });
      if (xml.length < 20000) out.push({ name, xml });
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return out;
}
async function wifiApply(list) {
  if (process.platform !== "win32") return 0;
  const have = new Set([...String((await run("netsh", ["wlan", "show", "profiles"])) || "").matchAll(/All User Profile\s*:\s*(.+)/g)].map((m) => m[1].trim()));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lodica-wifi-")); let n = 0;
  try {
    for (const w of Array.isArray(list) ? list.slice(0, 40) : []) {
      if (!w || typeof w.name !== "string" || typeof w.xml !== "string" || have.has(w.name) || BAD_NAME.test(w.name) || !/^<\?xml[\s\S]*<WLANProfile[\s\S]*<\/WLANProfile>\s*$/.test(w.xml)) continue;
      const file = path.join(dir, "p" + n + ".xml");
      fs.writeFileSync(file, w.xml);
      if ((await run("netsh", ["wlan", "add", "profile", "filename=" + file, "user=current"])) !== null) n++;
      fs.rmSync(file, { force: true });
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return n;
}
async function bluetoothCollect() {
  if (process.platform !== "win32") return [];
  const out = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-PnpDevice -Class Bluetooth -PresentOnly | Where-Object { $_.FriendlyName } | Select-Object -ExpandProperty FriendlyName"]);
  return [...new Set(String(out || "").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !/enumerator|radio|adapter|generic|service|transport|protocol|attribute|avrcp|a2dp|handsfree|hands-free|headset gateway|rfcomm|device information/i.test(s)))].slice(0, 50).map((s) => s.slice(0, 80));
}

module.exports = { CATS, SETTINGS, LISTS, mergePasswords, mergeTotp, union, mergeShortcuts, pickSettings, wifiCollect, wifiApply, bluetoothCollect };
