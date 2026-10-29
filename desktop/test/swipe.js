// Two-finger swipe: preload/swipe.js turns sideways wheel events into back/forward, and main.js loads it into every session.
// content.js is regenerated at build time, so the swipe code must live in its own file (it was lost in 1.13.57 and 1.13.58).
const { readFileSync } = require("fs");
const path = require("path");
const vm = require("vm");
let failed = 0;
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " " + (extra || ""))); if (!ok) failed++; };
const dir = path.join(__dirname, "..");
const read = (f) => readFileSync(path.join(dir, f), "utf8");

check("main.js registers the swipe and translate preloads on the sessions", /for \(const name of \["swipe", "translate"\]\)[\s\S]{0,120}registerPreloadScript/.test(read("main/main.js")));
check("preload/translate.js asks main for the translation", read("preload/translate.js").includes('invoke("translate-selection"') && read("main/helper.js").includes('handle("translate-selection"'));
check("build-preload does not touch swipe.js", !/swipe\.js/.test(read("scripts/build-preload.js")));
check("packaged files include preload/", read("package.json").includes('"preload/**"'));


// Plays wheel events (dx, dy) 5 ms apart. Returns what was sent to main: the back/forward calls with their time since the
// start, the arrow styles drawn, and the index of the last event sent when each call happened.
function run(events) {
  const sent = [], listeners = {}, made = [];
  const win = { addEventListener: (t, fn) => (listeners[t] = fn) };
  win.top = win;
  const doc = { documentElement: { appendChild() {} }, createElement: () => { const el = { setAttribute(_, v) { made.push(v); }, style: {}, firstChild: { style: {} }, remove() {}, isConnected: false }; return Object.defineProperty(el, "innerHTML", { set() {}, get: () => "" }); } };
  const ctx = vm.createContext({
    window: win, document: doc, getComputedStyle: () => ({ overflowX: "visible" }), setTimeout, clearTimeout, Date, Math, String, Number,
    require: (m) => { if (m === "electron") return { ipcRenderer: { send: (c, m2) => sent.push([c, m2, Date.now()]), invoke: () => Promise.resolve({ bg: "#112233", amber: "#aabbcc", text: "#ffffff" }) } }; throw new Error(m); },
  });
  vm.runInContext(read("preload/swipe.js"), ctx);
  return new Promise((resolve) => {
    const started = Date.now();
    let i = 0, calls = [];
    const finish = () => { const r = sent.filter((x) => x[1].dir).map((x) => x[1].dir); r.at = calls; r.arrows = made; r.evMs = events.length * 5; resolve(r); };
    const tick = () => {
      if (i < events.length) {
        const before = sent.filter((x) => x[1].dir).length;
        listeners.wheel({ deltaX: events[i][0], deltaY: events[i][1], ctrlKey: false, shiftKey: false, target: null });
        if (sent.filter((x) => x[1].dir).length > before) calls.push({ event: i, ms: Date.now() - started });
        i++; setTimeout(tick, 5);
      } else setTimeout(finish, 400);
    };
    setTimeout(tick, 20);
  });
}
const burst = (dx, dy, n) => Array.from({ length: n }, () => [dx, dy]);
// What a Windows touchpad sends: noisy rising steps while the fingers move, a zero step when they lift, then momentum
// that shrinks smoothly for a second or more (recorded from a real swipe).
const swipe = (sign, momentum = 150) => [...[14, 21, 28, 15, 44, 44, 39, 41, 43, 44, 48, 30, 75, 63, 55, 58, 63, 68, 71, 76, 73, 88].map((v) => [sign * v, 0]),
  [0, 0], ...Array.from({ length: momentum }, (_, k) => [sign * Math.round(58 * Math.pow(0.975, k)), 0])];

(async () => {
  let r = await run(burst(-14, 0, 12));
  check("fingers right (deltaX < 0) goes back, after the fingers stop", r.length === 1 && r[0] === "back", JSON.stringify(r));
  r = await run(burst(14, 0, 12));
  check("fingers left (deltaX > 0) goes forward", r.length === 1 && r[0] === "forward", JSON.stringify(r));
  r = await run(burst(0, 40, 12));
  check("vertical scroll does nothing", r.length === 0, JSON.stringify(r));
  r = await run(burst(-3, 0, 5));
  check("a short sideways nudge does nothing", r.length === 0, JSON.stringify(r));
  r = await run(burst(-14, 12, 12));
  check("diagonal scroll does nothing", r.length === 0, JSON.stringify(r));

  r = await run(burst(-14, 0, 80));
  check("it does not go while the fingers keep moving", r.length === 1 && r.at.length === 0, JSON.stringify(r.at));
  check("the arrow is drawn on every step while the fingers move", r.arrows.length >= 8, "drawn " + r.arrows.length + " times");

  r = await run(swipe(-1));
  check("lifting the fingers goes back once, momentum is ignored", r.length === 1 && r[0] === "back", JSON.stringify(r));
  check("it goes right when the fingers lift (the zero step), not when the momentum ends", r.at.length === 1 && r.at[0].event === 22, JSON.stringify(r.at) + " of " + r.evMs + "ms");
  r = await run(swipe(1));
  check("same for forward", r.length === 1 && r[0] === "forward", JSON.stringify(r));
  r = await run([...swipe(-1, 60), ...swipe(1, 60)]);
  check("a turn around after the momentum is a new gesture", r.length === 2 && r[0] === "back" && r[1] === "forward", JSON.stringify(r));
  r = await run([[-14, 0], [-21, 0], [-28, 0], [0, 0], ...Array.from({ length: 40 }, (_, k) => [Math.round(-30 * Math.pow(0.975, k)), 0])]);
  check("a gesture that stays short of the limit does nothing", r.length === 0, JSON.stringify(r));

  r = await run(burst(-14, 0, 4));
  check("arrow uses the theme colours", r.arrows.length > 0 && r.arrows.every((v) => v.includes("#112233") && v.includes("#aabbcc")), JSON.stringify(r.arrows));
  check("arrow stays an outline short of the limit", r.arrows.every((v) => !/background:#aabbcc/.test(v)));
  r = await run(burst(-14, 0, 12));
  check("arrow fills in past the limit", r.arrows.some((v) => /background:#aabbcc/.test(v)), JSON.stringify(r.arrows.slice(-1)));

  const content = read("preload/content.js");
  check("content.js sends translation through the main process", content.includes('invoke("translate"') && content.includes('invoke("fetchJson"'));
  check("content.js translates Dutch to French and French to Dutch", content.includes('nl: "fr", fr: "nl"'));
  console.log(failed ? failed + " failed" : "all passed");
  process.exit(failed ? 1 : 0);
})();
