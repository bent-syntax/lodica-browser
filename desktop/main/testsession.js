// Remote test session. Only runs after the user turned on "Let support connect for testing" and pressed Start.
// A maintainer joins with the code the user reads out and may run a short allowlist of in-app UI actions.
// Settings are backed up before a normal session and restored when it ends (not for the permanent one). No files, vault or credentials.
// "Always allow" (pref remoteTestAlways) keeps a permanent session open whenever the app runs, so support
// needs no new code each time. The badge stays visible and Stop turns it off again.
const relay = require("./relay");
const store = require("./store");
const prefs = require("./prefs");

const SETTINGS = new Set(["theme", "darkPages", "forceDark", "chatScale", "chatEmojiScale", "cookieReject", "spell", "spellAuto", "uiAlpha", "uiBlur",
  "vertTabs", "barBottom", "vertWidth", "vertCollapsed", "historySuggest", "mouse", "keybinds", "quality", "language", "userAgent", "desktopDefault",
  "holidayFx", "emojiPicker", "autoTop", "bg"]);
const SKIP = /vault|password|credential/i;
const s = { id: "", code: "", state: "off", expires: 0, seq: 0, run: 0, perm: false };
let ui = null, tabs = null, timer = null, backup = null, retry = null;

const clone = (v) => JSON.parse(JSON.stringify(v));
const info = () => ({ on: s.state !== "off", state: s.state, code: s.code, expires: s.expires, permanent: s.perm });
const push = () => { try { ui.push("testsession", info()); } catch {} };

/** Puts every pref back to the value it had before the session. */
function restore(b) {
  for (const k of Object.keys(b || {})) if (JSON.stringify(prefs.p[k]) !== JSON.stringify(b[k])) prefs.set(k, clone(b[k]));
  backup = null;
  store.save("testBackup", () => null);
}
/** After a crash in the middle of a session the backup is still on disk. Put it back at launch. */
function recover() { const b = store.load("testBackup", null); if (b) restore(b); }
function init(d) {
  ui = d.ui; tabs = d.tabs; recover();
  prefs.events.on("change", (k) => {
    if (k === "remoteTest" && !prefs.p.remoteTest) { if (prefs.p.remoteTestAlways) prefs.set("remoteTestAlways", false); stop(); }
    if (k === "remoteTestAlways") prefs.p.remoteTestAlways ? keep(1000) : s.perm && stop();
  });
  keep(5000);
}
/** Keeps the permanent session open: starts it now and again after it closes, while "Always allow" is on. */
function keep(ms) {
  clearTimeout(retry);
  if (!prefs.p.remoteTest || !prefs.p.remoteTestAlways) return;
  retry = setTimeout(async () => {
    if (!prefs.p.remoteTest || !prefs.p.remoteTestAlways || s.state !== "off") return;
    const r = await start(true).catch(() => null);
    if (!r || r.error) keep(60000);
  }, ms);
}

function end(why) {
  if (s.state === "off") return;
  s.run++; clearTimeout(timer);
  const wasPerm = s.perm;
  if (!wasPerm) restore(backup || store.load("testBackup", null));
  Object.assign(s, { id: "", code: "", state: "off", expires: 0, seq: 0, perm: false });
  push();
  if (wasPerm && why !== "stopped by you") return keep(30000);
  try { ui.toast("Test session ended" + (why ? ": " + why : "") + (wasPerm ? "." : ". Your settings are back as they were.")); } catch {}
}

const saved = () => String(store.loadSecret("testUnlock", "") || "");
/** The relay answers with text; parse it, or null when it is not JSON. */
function json(text) { try { return JSON.parse(text); } catch { return null; } }

/** Checks the code with the server. A good code is kept encrypted on this PC. */
async function unlock(code) {
  code = String(code || "").trim().slice(0, 200);
  if (!code) return { error: "Enter the code." };
  if (!relay.available) return { error: "No relay is set up. Pair this browser with your server first." };
  const [st] = await relay.request("POST", "/api/support/test/unlock", 15000, { unlock: code }).catch(() => [0]);
  if (st === 200) { store.saveSecret("testUnlock", code); prefs.set("remoteTest", true); return { ok: true }; }
  return { error: st === 403 ? "Wrong code." : st === 429 ? "Too many tries. Try again later." : "Support is not reachable right now." };
}

async function start(perm) {
  perm = perm === true;
  if (!prefs.p.remoteTest) return { error: "Turn on 'Let support connect for testing' first." };
  const code = saved();
  if (!code) { prefs.set("remoteTest", false); return { error: "Enter the support code first." }; }
  if (s.state !== "off") return info();
  if (!relay.available) return { error: "No relay is set up. Pair this browser with your server first." };
  const [st, text] = await relay.request("POST", "/api/support/test", 15000, { unlock: code, permanent: perm }).catch(() => [0, null]);
  const r = json(text);
  if (st === 403) { store.saveSecret("testUnlock", ""); prefs.set("remoteTest", false); return { error: "The support code is no longer valid. Enter it again." }; }
  if (st !== 200 || !r || !r.id) return { error: st === 429 ? "Too many tries. Try again later." : "Support is not reachable right now." };
  // A permanent session can run for days; restoring old settings at its end would undo the user's own changes.
  if (!perm) { backup = clone(prefs.p); store.save("testBackup", () => backup); }
  Object.assign(s, { id: r.id, code: r.code, state: perm ? "active" : "waiting", expires: r.expires, seq: 0, run: s.run + 1, perm });
  if (!perm) timer = setTimeout(() => end("expired"), Math.max(1000, r.expires - Date.now()));
  push();
  poll(s.run);
  return info();
}

async function stop() {
  if (s.state === "off") return info();
  const id = s.id;
  relay.request("POST", "/api/support/test/" + id, 8000, { stop: true }).catch(() => {});
  const wasPerm = s.perm;
  end("stopped by you");
  if (wasPerm && prefs.p.remoteTestAlways) prefs.set("remoteTestAlways", false);
  return info();
}

async function poll(run) {
  while (s.run === run && s.state !== "off") {
    let st, r;
    try { const [code, text] = await relay.request("GET", "/api/support/test/" + s.id + "?after=" + s.seq + "&wait=20", 30000); st = code; r = json(text); } catch { st = 0; }
    if (s.run !== run) return;
    if (st === 404 || (r && r.state === "stopped")) return end(r && r.why ? r.why : "closed");
    if (st !== 200 || !r) { await new Promise((ok) => setTimeout(ok, 3000)); continue; }
    if (s.perm) s.expires = r.expires;
    else if (r.state === "active" && s.state !== "active") {
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
    case "read":
      // Visible text of the browser window. Refuses while a vault, password or authenticator view is open, and never reads fields.
      return ui.chrome().executeJavaScript(`(()=>{const bad=/vault|password|credential|authenticator|totp|one-time/i;const open=[...document.querySelectorAll(".sheet,.layer,[role=dialog]")].filter(e=>e.offsetParent);if(open.some(e=>bad.test(e.className+" "+((e.querySelector("h2")||{}).textContent||""))))return {error:"a protected view is open"};const root=document.querySelector(${JSON.stringify(String(a.selector || ""))}||"body");if(!root)return {error:"no match"};let t=root.innerText||"";root.querySelectorAll("[id*=vault],[class*=vault],[class*=totp]").forEach(e=>{const x=e.innerText;if(x)t=t.split(x).join("")});return {text:t.replace(/\\n{3,}/g,"\\n\\n").slice(0,20000)}})()`);
    default: throw new Error("unknown action");
  }
}

module.exports = { init, start, stop, info, unlock };
