// Remote test session. Only runs after the user turned on "Let support connect for testing" and pressed Start.
// A maintainer joins with the code the user reads out and may run a short allowlist of in-app UI actions.
// Settings are backed up before the session and restored when it ends. No files, vault or credentials.
const relay = require("./relay");
const store = require("./store");
const prefs = require("./prefs");

const SETTINGS = new Set(["theme", "darkPages", "forceDark", "chatScale", "chatEmojiScale", "cookieReject", "spell", "spellAuto", "uiAlpha", "uiBlur",
  "vertTabs", "barBottom", "vertWidth", "vertCollapsed", "historySuggest", "mouse", "keybinds", "quality", "language", "userAgent", "desktopDefault",
  "holidayFx", "emojiPicker", "autoTop", "bg"]);
const SKIP = /vault|password|credential/i;
const s = { id: "", code: "", state: "off", expires: 0, seq: 0, run: 0 };
let ui = null, tabs = null, timer = null, backup = null;

const clone = (v) => JSON.parse(JSON.stringify(v));
const info = () => ({ on: s.state !== "off", state: s.state, code: s.code, expires: s.expires });
const push = () => { try { ui.push("testsession", info()); } catch {} };

/** Puts every pref back to the value it had before the session. */
function restore(b) {
  for (const k of Object.keys(b || {})) if (JSON.stringify(prefs.p[k]) !== JSON.stringify(b[k])) prefs.set(k, clone(b[k]));
  backup = null;
  store.save("testBackup", () => null);
}
/** After a crash in the middle of a session the backup is still on disk. Put it back at launch. */
function recover() { const b = store.load("testBackup", null); if (b) restore(b); }
function init(d) { ui = d.ui; tabs = d.tabs; recover(); prefs.events.on("change", (k) => { if (k === "remoteTest" && !prefs.p.remoteTest) stop(); }); }

function end(why) {
  if (s.state === "off") return;
  s.run++; clearTimeout(timer);
  restore(backup || store.load("testBackup", null));
  Object.assign(s, { id: "", code: "", state: "off", expires: 0, seq: 0 });
  push();
  try { ui.toast("Test session ended" + (why ? ": " + why : "") + ". Your settings are back as they were."); } catch {}
}

const saved = () => String(store.loadSecret("testUnlock", "") || "");
/** Checks the code with the server. A good code is kept encrypted on this PC. */
async function unlock(code) {
  code = String(code || "").trim().slice(0, 200);
  if (!code) return { error: "Enter the code." };
  if (!relay.available) return { error: "No relay is set up. Pair this browser with your server first." };
  const [st] = await relay.request("POST", "/api/support/test/unlock", 15000, { unlock: code }).catch(() => [0]);
  if (st === 200) { store.saveSecret("testUnlock", code); prefs.set("remoteTest", true); return { ok: true }; }
  return { error: st === 403 ? "Wrong code." : st === 429 ? "Too many tries. Try again later." : "Support is not reachable right now." };
}

async function start() {
  if (!prefs.p.remoteTest) return { error: "Turn on 'Let support connect for testing' first." };
  const code = saved();
  if (!code) { prefs.set("remoteTest", false); return { error: "Enter the support code first." }; }
  if (s.state !== "off") return info();
  if (!relay.available) return { error: "No relay is set up. Pair this browser with your server first." };
  const [st, r] = await relay.request("POST", "/api/support/test", 15000, { unlock: code }).catch(() => [0, null]);
  if (st === 403) { store.saveSecret("testUnlock", ""); prefs.set("remoteTest", false); return { error: "The support code is no longer valid. Enter it again." }; }
  if (st !== 200 || !r || !r.id) return { error: st === 429 ? "Too many tries. Try again later." : "Support is not reachable right now." };
  backup = clone(prefs.p);
  store.save("testBackup", () => backup);
  Object.assign(s, { id: r.id, code: r.code, state: "waiting", expires: r.expires, seq: 0, run: s.run + 1 });
  timer = setTimeout(() => end("expired"), Math.max(1000, r.expires - Date.now()));
  push();
  poll(s.run);
  return info();
}

async function stop() {
  if (s.state === "off") return info();
  const id = s.id;
  relay.request("POST", "/api/support/test/" + id, 8000, { stop: true }).catch(() => {});
  end("stopped by you");
  return info();
}

async function poll(run) {
  while (s.run === run && s.state !== "off") {
    let st, r;
    try { [st, r] = await relay.request("GET", "/api/support/test/" + s.id + "?after=" + s.seq + "&wait=20", 30000); } catch { st = 0; }
    if (s.run !== run) return;
    if (st === 404 || (r && r.state === "stopped")) return end(r && r.why ? r.why : "closed");
    if (st !== 200 || !r) { await new Promise((ok) => setTimeout(ok, 3000)); continue; }
    if (r.state === "active" && s.state !== "active") {
      s.state = "active"; s.expires = r.expires;
      clearTimeout(timer); timer = setTimeout(() => end("expired"), Math.max(1000, r.expires - Date.now()));
      push();
    }
    for (const c of r.cmds || []) {
      if (s.run !== run) return;
      s.seq = Math.max(s.seq, c.seq);
      let out;
      try { out = { seq: c.seq, ok: true, data: await exec(c.action, c.args || {}) }; } catch (e) { out = { seq: c.seq, ok: false, data: String(e && e.message || e).slice(0, 300) }; }
      relay.request("POST", "/api/support/test/" + s.id, 15000, { result: out }).catch(() => {});
    }
  }
}

const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
const target = (a) => a.target === "page" ? tabs.wcOf() : ui.chrome();
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** The whole allowlist. Each action touches only this app's own window. */
async function exec(action, a) {
  const wc = target(a);
  if (!wc || wc.isDestroyed()) throw new Error("nothing to act on");
  const x = num(a.x, 0, 8000), y = num(a.y, 0, 8000);
  switch (action) {
    case "click": case "tap":
      if (typeof a.selector === "string" && a.target !== "page") {
        if (SKIP.test(a.selector)) throw new Error("not allowed");
        return wc.executeJavaScript(`(()=>{const e=document.querySelector(${JSON.stringify(a.selector.slice(0, 200))});if(!e)return false;e.click();return true})()`);
      }
      wc.sendInputEvent({ type: "mouseMove", x, y });
      wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
      wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
      return true;
    case "type":
      if (typeof a.text !== "string") throw new Error("text needed");
      await wc.insertText(a.text.slice(0, 500)); return true;
    case "key": {
      const key = String(a.key || "").slice(0, 20);
      if (!key) throw new Error("key needed");
      const modifiers = (Array.isArray(a.modifiers) ? a.modifiers : []).filter((m) => ["shift", "control", "alt", "meta"].includes(m));
      wc.sendInputEvent({ type: "keyDown", keyCode: key, modifiers });
      wc.sendInputEvent({ type: "keyUp", keyCode: key, modifiers });
      return true;
    }
    case "scroll": case "pointer": {
      // Touchpad emulation: precise wheel deltas with begin/change/end phases.
      const dx = num(a.dx, -2000, 2000), dy = num(a.dy, -2000, 2000);
      const w = (phase) => wc.sendInputEvent({ type: "mouseWheel", x, y, deltaX: phase === "changed" ? dx : 0, deltaY: phase === "changed" ? dy : 0, hasPreciseScrollingDeltas: true, phase });
      w("began"); w("changed"); w("ended");
      return true;
    }
    case "swipe": {
      const x2 = num(a.x2, 0, 8000), y2 = num(a.y2, 0, 8000), n = 12;
      wc.sendInputEvent({ type: "mouseMove", x, y });
      wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
      for (let i = 1; i <= n; i++) { wc.sendInputEvent({ type: "mouseMove", x: Math.round(x + (x2 - x) * i / n), y: Math.round(y + (y2 - y) * i / n), modifiers: ["leftButtonDown"] }); await wait(16); }
      wc.sendInputEvent({ type: "mouseUp", x: x2, y: y2, button: "left", clickCount: 1 });
      return true;
    }
    case "setting":
      if (!SETTINGS.has(a.key)) throw new Error("setting not allowed: " + String(a.key).slice(0, 40));
      prefs.set(a.key, clone(a.value === undefined ? null : a.value));
      return prefs.p[a.key];
    case "open": {
      const u = String(a.url || "");
      if (!/^(https?|lodica):\/\//i.test(u)) throw new Error("only http, https and lodica addresses");
      tabs.create(u); return true;
    }
    case "snapshot":
      return ui.chrome().executeJavaScript(`(()=>{const bad=/vault|password|credential/i;return [...document.querySelectorAll("button,a,input,select,textarea,[role=button],[role=tab],[role=switch]")].filter(e=>!e.closest("[id*=vault],[class*=vault]")&&e.type!=="password"&&e.offsetParent).slice(0,250).map(e=>({tag:e.tagName.toLowerCase(),id:e.id||undefined,cls:String(e.className||"").slice(0,60)||undefined,text:(e.type==="text"||e.tagName==="TEXTAREA"?"":e.innerText||"").trim().slice(0,60)||undefined,title:e.title||undefined,sel:bad.test(e.id+e.className)?undefined:undefined}))})()`);
    default: throw new Error("unknown action");
  }
}

module.exports = { init, start, stop, info, unlock };
