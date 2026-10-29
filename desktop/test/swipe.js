// Two-finger swipe: preload/swipe.js turns sideways wheel events into back/forward, and main.js loads it into every session.
// content.js is regenerated at build time, so the swipe code must live in its own file (it was lost in 1.13.57 and 1.13.58).
const { readFileSync } = require("fs");
const path = require("path");
const vm = require("vm");
let failed = 0;
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " " + (extra || ""))); if (!ok) failed++; };
const dir = path.join(__dirname, "..");
const read = (f) => readFileSync(path.join(dir, f), "utf8");

check("main.js registers preload/swipe.js on the sessions", /registerPreloadScript\(\{[^}]*"lodica-swipe"[^}]*"swipe\.js"/.test(read("main/main.js")));
check("build-preload does not touch swipe.js", !/swipe\.js/.test(read("scripts/build-preload.js")));
check("packaged files include preload/", read("package.json").includes('"preload/**"'));

function run(events) {
  const sent = [], listeners = {};
  const win = { addEventListener: (t, fn) => (listeners[t] = fn) };
  win.top = win;
  const doc = { documentElement: { appendChild() {}, }, createElement: () => ({ setAttribute() {}, style: {}, firstChild: { style: {} }, remove() {}, isConnected: false }) };
  const ctx = vm.createContext({
    window: win, document: doc, getComputedStyle: () => ({ overflowX: "visible" }), setTimeout, clearTimeout, Date, Math, String, Number,
    require: (m) => { if (m === "electron") return { ipcRenderer: { send: (c, m2) => sent.push([c, m2]) } }; throw new Error(m); },
  });
  vm.runInContext(read("preload/swipe.js"), ctx);
  return new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      if (i < events.length) { listeners.wheel({ deltaX: events[i][0], deltaY: events[i][1], ctrlKey: false, shiftKey: false, target: null }); i++; setTimeout(tick, 5); }
      else setTimeout(() => resolve(sent.filter((s) => s[1].dir)), 400);
    };
    tick();
  });
}
const burst = (dx, dy, n) => Array.from({ length: n }, () => [dx, dy]);

(async () => {
  let r = await run(burst(-14, 0, 12));
  check("fingers right (deltaX < 0) goes back", r.length === 1 && r[0][0] === "swipe" && r[0][1].dir === "back", JSON.stringify(r));
  r = await run(burst(14, 0, 12));
  check("fingers left (deltaX > 0) goes forward", r.length === 1 && r[0][1].dir === "forward", JSON.stringify(r));
  r = await run(burst(0, 40, 12));
  check("vertical scroll does nothing", r.length === 0, JSON.stringify(r));
  r = await run(burst(-3, 0, 5));
  check("a short sideways nudge does nothing", r.length === 0, JSON.stringify(r));
  r = await run(burst(-14, 12, 12));
  check("diagonal scroll does nothing", r.length === 0, JSON.stringify(r));
  console.log(failed ? failed + " failed" : "all passed");
  process.exit(failed ? 1 : 0);
})();
