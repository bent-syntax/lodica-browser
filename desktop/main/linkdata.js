"use strict";
// What linked devices can share, in twelve categories. Each device picks the ones it sends and accepts (Settings > Linked devices).
// Three of them (passwords, authenticator keys, Wi-Fi passwords) travel sealed under the link key (linkkey.js), so a device
// that is linked but holds no key cannot read them. collect() builds what goes into the encrypted blob, apply() takes in what
// the other device sent. The merge helpers are pure so they can be tested.
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { cleanArt } = require("./faceart");

const CATS = [
  { id: "tabs", label: "Open tabs", note: "Shown in Settings on the other device" },
  { id: "history", label: "History", note: "Pages you visit appear on the other device too" },
  { id: "totp", label: "Authenticator keys", note: "Both devices end up with all of them", locked: true },
  { id: "passwords", label: "Passwords", note: "Both devices end up with all of them", locked: true },
  { id: "chatName", label: "Name in the server chat", note: "Both devices use the same chat name" },
  { id: "bluetooth", label: "Bluetooth devices", note: "The names of paired devices, shown on the other device" },
  { id: "wifi", label: "Wi-Fi networks and passwords", note: "Windows only. Both devices end up with all of them", locked: true, platform: "win32" },
  { id: "shortcuts", label: "Start page shortcuts", note: "The tiles under the search bar" },
  { id: "settings", label: "Settings and themes", note: "Look, language, search and blocking choices. Not links or keys" },
  { id: "sites", label: "Site lists", note: "Sites you allowed, sites that go direct, sites without the hidden-email button" },
  { id: "character", label: "Chat character", note: "Your server chat character looks the same on both devices" },
  { id: "notes", label: "Notes", note: "Your notebook on both devices. Notes live on your linked devices, not on the server" },
];
/** On for a fresh link, until the user switches it off. Passwords and keys still only travel once the link key is on both devices. Wi-Fi, history and Bluetooth stay off. */
const DEFAULT_SHARE = { tabs: true, settings: true, shortcuts: true, sites: true, chatName: true, passwords: true, totp: true, character: true, notes: true };
const isShared = (share, id) => (share && share[id] !== undefined ? !!share[id] : !!DEFAULT_SHARE[id]);
const SETTINGS = ["theme", "customTheme", "savedThemes", "language", "darkPages", "httpsOnly", "search", "searchFallback", "adBlockLevel", "cookieReject", "spell", "spellAuto",
  "spellLangs", "selTranslate", "translateAi", "chatScale", "chatEmojiScale", "uiBlur", "uiAlpha", "vertTabs", "barBottom", "bg",
  "searchWords", "shortcutNames", "autoTop", "startNotes", "startPlanner", "plannerPos", "notesPos"];
/** Where the theme comes from: the newest change on either device, this device only, or the other device. */
const THEME_KEYS = ["theme", "customTheme"];
const THEME_FROM = ["newest", "this", "other"];
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
/** A chat character as linked devices share it: a glyph, the costume SVG, the hands that grip the typing bar and the thinking bubble. Null when it holds nothing. */
function cleanCharacter(c) {
  if (!c || typeof c !== "object") return null;
  const out = { glyph: str(c.glyph, 40), desc: str(c.desc, 200), custom: !!c.custom, art: cleanArt(c.art), hands: cleanArt(c.hands), bubble: cleanArt(c.bubble), at: Math.max(0, Number(c.at) || 0) };
  return out.glyph || out.art ? out : null;
}
/** One character per user: a character the user asked for beats one the app made up, then the newer one wins, so every device ends up with the same one. */
function betterCharacter(a, b) {
  if (!!a.custom !== !!b.custom) return !!a.custom;
  if (a.at !== b.at) return a.at > b.at;
  for (const k of ["art", "glyph", "desc", "hands", "bubble"]) if (a[k] !== b[k]) return a[k] > b[k]; // plain text order, the same on every platform
  return false;
}
const sameCharacter = (a, b) => ["glyph", "desc", "custom", "art", "hands", "bubble", "at"].every((k) => a[k] === b[k]);
function mergeCharacter(local, remote) {
  const r = cleanCharacter(remote), l = cleanCharacter(local);
  if (!r) return { value: l, changed: false };
  if (!l || betterCharacter(r, l)) return { value: r, changed: !l || !sameCharacter(l, r) };
  return { value: l, changed: false };
}
const NOTES_MAX = 500, NOTE_TEXT = 200000, TOMB_TTL = 30 * 24 * 3600e3;
/** Notes: one per id, the newer edit wins and a delete is a note with `deleted` so it travels too. Adopted notes get a new `rev` so an open editor sees the change. */
function mergeNotes(local, remote, now = Date.now()) {
  const out = new Map();
  for (const n of Array.isArray(local) ? local : []) if (n && typeof n.id === "string") out.set(n.id, n);
  let changed = 0;
  for (const r of Array.isArray(remote) ? remote : []) {
    if (!r || typeof r.id !== "string" || !/^[\w-]{1,40}$/.test(r.id)) continue;
    const e = { id: r.id, text: r.deleted ? "" : str(r.text, NOTE_TEXT), at: Math.max(0, Number(r.at) || 0), rev: 0 };
    if (r.deleted) e.deleted = true;
    const cur = out.get(e.id);
    const wins = !cur || e.at > (cur.at || 0) || (e.at === (cur.at || 0) && ((e.deleted && !cur.deleted) || (!e.deleted && !cur.deleted && e.text > cur.text)));
    if (!wins) continue;
    if (cur && !!cur.deleted === !!e.deleted && cur.text === e.text && (cur.at || 0) === e.at) continue;
    e.rev = (cur ? cur.rev || 0 : 0) + 1;
    out.set(e.id, e); changed++;
  }
  const list = [...out.values()].filter((n) => !n.deleted || now - (n.at || 0) < TOMB_TTL).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, NOTES_MAX);
  return { list, changed };
}
/** The part of the notes that fits the sync budget, newest first: whole notes only. */
function notesForSync(list, budget = 200000) {
  const out = []; let used = 0;
  for (const n of (Array.isArray(list) ? list : []).slice().sort((a, b) => (b.at || 0) - (a.at || 0))) {
    const item = n.deleted ? { id: n.id, deleted: true, at: n.at } : { id: n.id, text: n.text, at: n.at };
    const size = JSON.stringify(item).length;
    if (used + size > budget) continue;
    used += size; out.push(item);
  }
  return out;
}
/** Settings: only the known keys, and only values of the same kind as the local one. */
function pickSettings(source, current) {
  const out = {};
  for (const k of SETTINGS) if (source && k in source && typeof source[k] === typeof current[k] && (k !== "customTheme" || source[k] === null || typeof source[k] === "object")) out[k] = source[k];
  if ("searchWords" in out) {
    if (!Array.isArray(out.searchWords)) delete out.searchWords;
    else out.searchWords = out.searchWords.filter((r) => r && typeof r.word === "string" && typeof r.url === "string" && r.word.trim() && r.url.trim())
      .slice(0, 200).map((r) => ({ word: str(r.word, 40).trim(), url: str(r.url, 2000).trim() }));
  }
  if ("savedThemes" in out) {
    const HEX = /^#[0-9a-f]{6}$/i;
    if (!Array.isArray(out.savedThemes)) delete out.savedThemes;
    else out.savedThemes = out.savedThemes.filter((t) => t && typeof t.name === "string" && t.name.trim() && ["bg", "text", "accent", "accent2"].every((k) => HEX.test(t[k]))).slice(0, 50)
      .map((t) => { const o = { name: str(t.name, 40).trim() }; for (const k of ["bg", "text", "accent", "accent2", "raised", "high", "muted", "danger", "tab", "tabText", "tabEdge", "startBg"]) if (HEX.test(t[k])) o[k] = t[k]; if (require("./aitheme").TEXTURES.includes(t.tabTex)) o.tabTex = t.tabTex; return o; });
  }
  for (const k of ["plannerPos", "notesPos"]) if (k in out && !["left", "right", "below"].includes(out[k])) delete out[k];
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

module.exports = { DEFAULT_SHARE, isShared, CATS, SETTINGS, LISTS, THEME_KEYS, THEME_FROM, mergePasswords, mergeTotp, union, mergeShortcuts, cleanCharacter, mergeCharacter, mergeNotes, notesForSync, pickSettings, wifiCollect, wifiApply, bluetoothCollect };
