// Bridge to the in-page helper (preload/content.js): hidden-email fill, one-time codes,
// saved logins, reader text, site icons and data use. Mirrors the Android Helper object.
const { ipcMain } = require("electron");
const crypto = require("crypto");
const Relay = require("./relay");
const prefs = require("./prefs");

let deps = null; // { tabs, ui, vault, meter }, injected to avoid circular requires
const frames = new Map();  // tab -> [{ frame, form, focus }]
const pending = new Map(); // tab -> { alias, signup, waiting: Set, ok }
const owners = new Map();  // alias address -> tab
const users = new Map();   // tab -> [baseDomain, user]
const signups = new Map(); // tab -> signup

const WORDS = ["amber", "brisk", "cedar", "delta", "ember", "fable", "glint", "harbor", "ivory", "juniper", "kestrel",
  "lumen", "maple", "nova", "orbit", "pebble", "quartz", "raven", "sable", "tidal", "umber", "vale", "willow", "zephyr"];
const FIRST = ["Alex", "Sam", "Robin", "Jamie", "Noah", "Emma", "Lucas", "Mila", "Leo", "Nora", "Finn", "Lena"];
// One fixed dummy identity detail set, the same on every site and on the phone: a Belgian address and an adult birthday.
const ADDRESS = { street: "Rue de la Loi", number: "16", postcode: "1000", city: "Brussels", state: "Brussels-Capital Region", country: "Belgium", countryCode: "BE" };
const BIRTHDAY = { year: 1994, month: 5, day: 17 };
const LAST = ["Peeters", "Jansen", "Maes", "Claes", "Wouters", "Martin", "Dubois", "Smith", "Meyer", "Vos"];
const SETS = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!#%*-_.@"];

const rnd = n => crypto.randomInt(n);
const pick = list => list[rnd(list.length)];
const cap = s => s[0].toUpperCase() + s.slice(1);
const web = o => /^https?:\/\//i.test(o || "");
const hostOf = u => { try { return new URL(u).hostname; } catch { return ""; } };

/** 18 characters with at least one of each class, starting with a letter. */
function password() {
  const all = SETS.join("");
  const out = SETS.map(pick);
  while (out.length < 18) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  const letter = out.findIndex(c => /[a-z]/i.test(c));
  if (letter > 0) [out[0], out[letter]] = [out[letter], out[0]];
  return out.join("");
}

function username() { return pick(WORDS) + cap(pick(WORDS)) + (100 + rnd(9900)); }

function newSignup(alias) {
  const first = pick(FIRST), last = pick(LAST);
  // One identity per use: the username is derived from the same name that goes in the name fields.
  const s = { alias, pass: password(), user: (first + last).toLowerCase() + (10 + rnd(90)), first, last, until: Date.now() + 15 * 60000, saved: "" };
  s.json = type => ({ type, value: alias.address, pass: s.pass, user: s.user, first: s.first, last: s.last, addr: ADDRESS, bday: BIRTHDAY });
  return s;
}

function sameSite(a, b) {
  if (!a || !b) return false;
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}

function send(entry, msg) { try { entry.frame.send("helper", msg); } catch { /* frame gone */ } }
function live(tab) {
  const list = (frames.get(tab) || []).filter(f => !f.frame.isDestroyed?.() && f.frame.detached !== true);
  frames.set(tab, list);
  return list;
}

/** Fill a fresh hidden-email alias (and generated signup details) into the page. */
function fill(tab) {
  const list = live(tab);
  const focused = list.filter(f => f.focus);
  const targets = focused.length ? focused : list;
  const prev = pending.get(tab);
  if (prev && !prev.ok) Relay.forget(prev.alias.address);
  if (!targets.length) { deps.ui.toast("No email field on this page"); return; }
  const alias = Relay.newAlias(tab.host || "site");
  const signup = newSignup(alias);
  pending.set(tab, { alias, signup, waiting: new Set(targets), ok: false });
  for (const f of targets) send(f, signup.json("fill"));
  // Frames that navigate away or never answer count as "not filled".
  setTimeout(() => { const p = pending.get(tab); if (p && p.signup === signup) for (const f of [...p.waiting]) filled(tab, f, false); }, 4000);
}

function filled(tab, entry, ok) {
  const p = pending.get(tab);
  if (!p) return;
  p.waiting.delete(entry);
  const addr = p.alias.address;
  if (ok && !p.ok) {
    p.ok = true;
    owners.set(addr, tab);
    signups.set(tab, p.signup);
    users.set(tab, [Relay.baseDomain(tab.host), addr]);
    Relay.watch(p.alias);
    deps.ui.toast("Using " + addr);
  }
  if (!p.waiting.size) {
    pending.delete(tab);
    if (!p.ok) { Relay.forget(addr); deps.ui.toast("No email field on this page"); }
  }
}

function code(alias, value) {
  const { tabs } = deps;
  const site = alias.site;
  const same = t => t && !t.private && sameSite(Relay.baseDomain(t.host), site);
  let tab = owners.get(alias.address);
  if (!tab || !live(tab).length) tab = null;
  if (!tab && same(tabs.current())) tab = tabs.current();
  if (!tab) tab = tabs.all().find(t => same(t) && live(t).length) || null;
  if (!tab) return;
  for (const f of live(tab)) send(f, { type: "code", value });
}

let readerWait = null;
function reader(tab) {
  const top = live(tab).find(f => f.top);
  if (!top) return Promise.resolve(null);
  if (readerWait) readerWait.resolve(null);
  return new Promise(resolve => {
    const timer = setTimeout(() => { readerWait = null; resolve(null); }, 8000);
    readerWait = { tab, resolve: v => { clearTimeout(timer); readerWait = null; resolve(v); } };
    send(top, { type: "reader" });
  });
}

function pageState(tab) {
  const host = tab?.host || "";
  const p = prefs.p;
  return {
    cookies: p.cookieReject && !prefs.isTrusted(host),
    ads: !prefs.isTrusted(host) && !prefs.isCompat(host),
    dark: p.darkPages,
    speed: p.speed,
    quality: prefs.qualityFor(host) ?? p.quality,
    qualities: p.qualities,
    siteOverrides: p.siteOverrides || {},
  };
}

/** Per-site override for a hostname (exact or parent domain), or null. Used by the preload at document start. */
function overrideFor(host) { return prefs.siteOverride(host); }

function pushPage() {
  if (!deps) return;
  for (const t of deps.tabs.all()) {
    const wc = t.view?.webContents;
    if (wc && !wc.isDestroyed()) try { wc.send("page", pageState(t)); } catch { /* not loaded */ }
  }
}

function forgetTab(tab) {
  frames.delete(tab); pending.delete(tab); users.delete(tab); signups.delete(tab);
  for (const [a, t] of owners) if (t === tab) owners.delete(a);
}

const sameFrame = (a, b) => a === b || (a.processId === b.processId && a.routingId === b.routingId);
function entryOf(tab, frame) { return live(tab).find(f => sameFrame(f.frame, frame)); }

/** The hidden-email button shows on sign-up pages only, and never on sites the user switched it off for. */
function offer(tab, m) {
  const h = (tab.host || "").replace(/^www\./, "");
  return !!m.signup && !prefs.p.noDummy.some(d => h === d || h.endsWith("." + d));
}

async function onMessage(tab, frame, m) {
  const { ui, vault, meter } = deps;
  const host = tab.host || "";
  switch (m.type) {
    case "nav":
      if (frame.parent) return;
      if (m.dir === "back" || m.dir === "forward") require("./commands").mouse(m.dir);
      return;
    case "hello": {
      let list = live(tab).filter(f => !sameFrame(f.frame, frame));
      const entry = { frame, top: !!m.top, form: false, focus: false };
      list.push(entry);
      frames.set(tab, list);
      const s = signups.get(tab);
      if (s && s.until < Date.now()) signups.delete(tab);
      else if (s && sameSite(Relay.baseDomain(m.host), s.alias.site)) send(entry, s.json("signup"));
      break;
    }
    case "filled": { const e = entryOf(tab, frame); if (e) filled(tab, e, !!m.ok); break; }
    case "coded": ui.toast("Code filled in"); break;
    case "challenge":
      if (m.host && !prefs.isCompat(m.host)) {
        prefs.setCompat(m.host, true);
        tab.view?.webContents.reload();
        ui.toast("Compatibility mode on for " + m.host);
      }
      break;
    case "login": prefs.addDirect([Relay.baseDomain(m.host), Relay.baseDomain(host)].filter(Boolean)); break;
    case "user": if (m.value) users.set(tab, [Relay.baseDomain(m.host), String(m.value)]); break;
    case "creds": {
      if (!m.pass || !web(m.origin) || tab.private) break;
      const h = hostOf(m.origin);
      const known = users.get(tab);
      const user = String(m.user || "").trim() || (known && known[0] === Relay.baseDomain(h) ? known[1] : "");
      const ok = await ui.prompt({ title: `Save password for ${h}?`, message: `Login: ${user || "(none)"}. Stored encrypted on this PC only.`, ok: "Save", cancel: "Not now" });
      if (ok) vault.save(m.origin, user, m.pass);
      break;
    }
    case "signed": {
      const s = signups.get(tab);
      if (!s || !m.pass || tab.private || !web(m.origin)) break;
      const key = m.origin + "\n" + m.pass;
      if (key === s.saved) break;
      vault.save(m.origin, s.alias.address, m.pass);
      s.saved = key;
      ui.toast("Login saved for " + hostOf(m.origin));
      break;
    }
    case "email": {
      // Same as Android: an email field existing marks the form; the focused flag only drives the focus state.
      const e = entryOf(tab, frame); if (e) { e.form = offer(tab, m); e.focus = !!m.focused && e.form; }
      tab.emailForm = live(tab).some(f => f.form);
      tab.emailFocus = live(tab).some(f => f.focus);
      ui.push("tab", deps.tabs.info(tab));
      break;
    }
    case "focus": {
      const e = entryOf(tab, frame); if (e) { e.form = offer(tab, m); e.focus = !!m.on && e.form; }
      tab.emailForm = live(tab).some(f => f.form);
      tab.emailFocus = live(tab).some(f => f.focus);
      ui.push("tab", deps.tabs.info(tab));
      break;
    }
    case "icons": {
      const ok = (Array.isArray(m.list) ? m.list : []).filter(u => typeof u === "string" && (/^https?:\/\//i.test(u) || u.startsWith("data:image/")));
      tab.icons = [...new Set(ok)].slice(0, 12);
      break;
    }
    case "data": if (!tab.private && m.host) meter.used(m.host, Number(m.used) || 0); break;
    case "article": if (readerWait && readerWait.tab === tab) readerWait.resolve({ title: m.title || "", text: m.text || "" }); break;
  }
}

function init(d) {
  deps = d;
  Relay.setOnCode(code);
  ipcMain.on("helper", (e, m) => {
    const frame = e.senderFrame;
    const tab = deps.tabs.byContents(e.sender);
    if (!tab || !frame || !m || typeof m.type !== "string") return;
    onMessage(tab, frame, m).catch(() => {});
  });
  ipcMain.on("siteOverride", (e, host) => { e.returnValue = overrideFor(host); });
  ipcMain.handle("page", e => pageState(deps.tabs.byContents(e.sender)));
  prefs.events.on("change", pushPage);
}

module.exports = { init, overrideFor, fill, reader, pageState, pushPage, forgetTab, password, username, ADDRESS, BIRTHDAY };
