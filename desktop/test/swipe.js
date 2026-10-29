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
  const made = [];
  const doc = { documentElement: { appendChild() {}, }, createElement: () => { const el = { setAttribute(_, v) { made.push(v); }, style: {}, firstChild: { style: {} }, remove() {}, isConnected: false }; return Object.defineProperty(el, "innerHTML", { set() {}, get: () => "" }); } };
  const ctx = vm.createContext({
    window: win, document: doc, getComputedStyle: () => ({ overflowX: "visible" }), setTimeout, clearTimeout, Date, Math, String, Number,
    require: (m) => { if (m === "electron") return { ipcRenderer: { send: (c, m2) => sent.push([c, m2, Date.now()]), invoke: () => Promise.resolve({ bg: "#112233", amber: "#aabbcc", text: "#ffffff" }) } }; throw new Error(m); },
  });
  vm.runInContext(read("preload/swipe.js"), ctx);
  ctx.__made = made;
  return new Promise((resolve) => {
    const started = Date.now();
    let i = 0;
    const tick = () => {
      if (i < events.length) { listeners.wheel({ deltaX: events[i][0], deltaY: events[i][1], ctrlKey: false, shiftKey: false, target: null }); i++; setTimeout(tick, 5); }
      else setTimeout(() => { const r = sent.filter((s) => s[1].dir); r.firstAt = r[0] ? r[0][2] - started : -1; r.arrows = made.filter((v) => /border-radius:50%/.test(v)); resolve(r); }, 400);
    };
    setTimeout(tick, 20);
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
  r = await run(burst(-14, 0, 200));
  check("momentum after the fingers lift gives exactly one back", r.length === 1 && r[0][1].dir === "back", JSON.stringify(r));
  check("navigates as soon as the limit is passed, not after the events stop", r.firstAt >= 0 && r.firstAt < 400, "first send at " + r.firstAt + "ms of ~1600ms");
  r = await run(burst(-14, 0, 4));
  check("arrow uses the theme colours", r.arrows.length > 0 && r.arrows.every((v) => v.includes("#112233") && v.includes("#aabbcc")), JSON.stringify(r.arrows));
  const content = read("preload/content.js");
  check("content.js sends translation through the main process", content.includes('invoke("translate"') && content.includes('invoke("fetchJson"'));
  check("content.js translates Dutch to French and French to Dutch", content.includes('nl: "fr", fr: "nl"'));
  check("content.js has the auto translate bubble", content.includes("async function autoTranslate"));
  console.log(failed ? failed + " failed" : "all passed");
  process.exit(failed ? 1 : 0);
})();
