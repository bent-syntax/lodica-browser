// Local QR hover tests: jsQR roundtrip, overlay behaviour, main handler and static wiring guards.
const assert = require("assert");
const fs = require("fs"), path = require("path"), vm = require("vm");

const QR_TEXT = "https://example.com/a?b=1#frag";
// 25x25 module matrix for QR_TEXT (version 2), generated once and kept here so tests stay offline.
const QR_BITS = [
  "1111111001010100101111111",
  "1000001010100111101000001",
  "1011101001101010001011101",
  "1011101011001111001011101",
  "1011101000010100101011101",
  "1000001010101011001000001",
  "1111111010101010101111111",
  "0000000000011010100000000",
  "1111101111100100010101010",
  "0101010101010100010100010",
  "1001011011001111100101011",
  "1111000001110011101100001",
  "1101011011001111011010111",
  "1101010101110000100101010",
  "1011111110100001001111011",
  "1011110010011011111110001",
  "1011001001001100111110100",
  "0000000011111111100011000",
  "1111111010100110101010111",
  "1000001001001010100011000",
  "1011101011000111111110110",
  "1011101010111001011011111",
  "1011101010000101000001101",
  "1000001010100000110111001",
  "1111111011010100011111111",
];

function render(bits, scale = 8, quiet = 4) {
  const n = bits.length, side = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const mr = Math.floor(y / scale) - quiet, mc = Math.floor(x / scale) - quiet;
    const v = mr >= 0 && mr < n && mc >= 0 && mc < n && bits[mr][mc] === "1" ? 0 : 255;
    const i = (y * side + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width: side, height: side };
}
const FIXTURE = render(QR_BITS);

function fakeImage(rgba) {
  const bgra = Buffer.alloc(rgba.data.length);
  for (let i = 0; i < rgba.data.length; i += 4) {
    bgra[i] = rgba.data[i + 2]; bgra[i + 1] = rgba.data[i + 1];
    bgra[i + 2] = rgba.data[i]; bgra[i + 3] = rgba.data[i + 3];
  }
  return { getSize: () => ({ width: rgba.width, height: rgba.height }), toBitmap: () => bgra, isEmpty: () => false };
}

// Stub Electron before loading the main modules; no display or app is needed.
const handlers = {};
const dataUrls = [];
const ELECTRON = require.resolve("electron");
require.cache[ELECTRON] = {
  id: ELECTRON, filename: ELECTRON, loaded: true,
  exports: {
    ipcMain: { on: (name, fn) => { handlers[name] = fn; } },
    nativeImage: { createFromDataURL: src => { dataUrls.push(src); return fakeImage(FIXTURE); } },
  },
};
const qrdecode = require("../main/qrdecode");
const qrhover = require("../main/qrhover");

// jsQR roundtrip keeps the query and fragment byte for byte.
assert.strictEqual(qrdecode.decodeRgba(FIXTURE.data, FIXTURE.width, FIXTURE.height), QR_TEXT);
assert.strictEqual(qrdecode.decodeImage(fakeImage(FIXTURE)), QR_TEXT);
assert.strictEqual(qrdecode.decodeDataUrl("data:image/png;base64,AAAA"), QR_TEXT);
assert.strictEqual(dataUrls.length, 1);
assert.strictEqual(qrdecode.decodeDataUrl("https://example.com/qr.png"), null);
assert.strictEqual(qrdecode.decodeRgba(FIXTURE.data, 0, 0), null);
const swapped = qrdecode.toRgba({ getSize: () => ({ width: 2, height: 1 }), toBitmap: () => Buffer.from([0, 0, 255, 255, 10, 20, 30, 255]) });
assert.deepStrictEqual(Array.from(swapped.data), [255, 0, 0, 255, 30, 20, 10, 255]);

assert.deepStrictEqual(qrhover.clampRect({ x: -5, y: 10, width: 3000, height: 100 }), { x: 0, y: 10, width: 1024, height: 100 });
assert.strictEqual(qrhover.clampRect({ x: 0, y: 0, width: 10, height: 10 }), null);
assert.deepStrictEqual(qrhover.cursorPoint({ x: 5, y: 6, cx: 12, cy: 34 }, { x: 0, y: 44 }, { width: 1000, height: 800 }), { x: 12, y: 78 });

const flush = () => new Promise(r => setImmediate(() => setImmediate(r)));

async function mainHandlerTests() {
  let now = 1000;
  const pushes = [], captureRects = [];
  let captures = 0;
  const wc = {
    isDestroyed: () => false,
    getSize: () => ({ width: 800, height: 600 }),
    capturePage: async rect => { captures++; captureRects.push(rect); return fakeImage(FIXTURE); },
  };
  const tab = { view: { webContents: wc, getBounds: () => ({ x: 0, y: 44, width: 800, height: 600 }) } };
  const sender = {};
  qrhover.init({ tabs: { byContents: s => s === sender ? tab : null }, ui: { push: (ev, d) => pushes.push({ ev, d }) }, now: () => now });

  handlers.qrHover({ sender }, { x: 5, y: 6, width: 200, height: 200, tag: "img", cx: 10, cy: 20 });
  await flush();
  assert.strictEqual(captures, 1);
  assert.deepStrictEqual(captureRects[0], { x: 5, y: 6, width: 200, height: 200 });
  assert.deepStrictEqual(pushes.pop(), { ev: "qrDecoded", d: { url: QR_TEXT, x: 10, y: 64 } });

  now += 10;
  handlers.qrHover({ sender }, { x: 5, y: 6, width: 200, height: 200, tag: "svg", cx: 11, cy: 21 });
  await flush();
  assert.strictEqual(captures, 1); // throttled

  now += 130;
  handlers.qrHover({ sender }, { x: 7, y: 8, width: 200, height: 200, tag: "canvas", cx: 30, cy: 40 });
  await flush();
  assert.strictEqual(captures, 2);
  assert.deepStrictEqual(pushes.pop().d, { url: QR_TEXT, x: 30, y: 84 });

  const before = pushes.length;
  handlers.qrHover({ sender: {} }, { x: 1, y: 1, width: 100, height: 100, tag: "img", cx: 1, cy: 1 });
  await flush();
  assert.strictEqual(pushes.length, before); // unknown sender never reaches capturePage

  handlers.qrHover({ sender }, { clear: true });
  assert.deepStrictEqual(pushes.pop().d, { url: "", x: 0, y: 0 });

  // Latest wins while a capture is in flight: only the newest rect may publish.
  const s2 = {}, resolvers = [], pushes2 = [];
  const wc2 = { isDestroyed: () => false, getSize: () => ({ width: 800, height: 600 }), capturePage: () => new Promise(r => resolvers.push(r)) };
  const tab2 = { view: { webContents: wc2, getBounds: () => ({ x: 0, y: 44, width: 800, height: 600 }) } };
  qrhover.init({ tabs: { byContents: s => s === s2 ? tab2 : null }, ui: { push: (ev, d) => pushes2.push(d) }, now: () => now });
  handlers.qrHover({ sender: s2 }, { x: 1, y: 1, width: 100, height: 100, tag: "img", cx: 1, cy: 1 });
  await flush();
  assert.strictEqual(resolvers.length, 1);
  now += 200;
  handlers.qrHover({ sender: s2 }, { x: 2, y: 2, width: 100, height: 100, tag: "canvas", cx: 2, cy: 2 });
  await flush();
  assert.strictEqual(resolvers.length, 1);
  resolvers.shift()(fakeImage(FIXTURE));
  await flush();
  assert.strictEqual(pushes2.length, 0);
  assert.strictEqual(resolvers.length, 1);
  resolvers.shift()(fakeImage(FIXTURE));
  await flush();
  assert.deepStrictEqual(pushes2, [{ url: QR_TEXT, x: 2, y: 46 }]);
}

function loadOverlay(nowRef) {
  const sends = [], listeners = {};
  const sandbox = {
    ipcRenderer: { send: (...a) => sends.push(a) },
    window: {}, location: { protocol: "https:" }, scrollX: 0, scrollY: 0,
    document: { addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); } },
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    Date: { now: nowRef }, console, Math, Number, String,
  };
  sandbox.window.top = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "scripts", "overlay", "qrhover.js"), "utf8"), sandbox);
  return { sends, sandbox, fire: (name, ev) => { for (const f of listeners[name] || []) f(ev); } };
}

function element(tag, rect, src = "") {
  const qr = tag === "qr";
  return {
    nodeType: 1, tagName: qr ? "DIV" : tag, currentSrc: src, parentElement: null,
    matches(sel) { return sel.split(",").map(s => s.trim()).some(s => s === "[data-qr]" ? qr : s.toLowerCase() === String(this.tagName).toLowerCase()); },
    hasAttribute(n) { return qr && n === "data-qr"; },
    getBoundingClientRect: () => rect,
    getAttribute: () => null,
  };
}
const move = (el, x, y) => ({ target: el, composedPath: () => [el], clientX: x, clientY: y });
const plain = v => JSON.parse(JSON.stringify(v)); // VM objects have a different prototype.

function overlayTests() {
  let now = 0;
  const o = loadOverlay(() => now);
  const img = element("img", { left: 10, top: 20, width: 100, height: 100 }, "https://example.com/qr.png");
  const canvas = element("canvas", { left: 30, top: 40, width: 120, height: 120 });
  const svg = element("svg", { left: 50, top: 60, width: 140, height: 140 });
  const qr = element("qr", { left: 70, top: 80, width: 64, height: 64 });

  o.fire("pointermove", move(img, 12, 22));
  assert.deepStrictEqual(plain(o.sends.pop()), ["qrHover", { x: 10, y: 20, width: 100, height: 100, tag: "img", cx: 12, cy: 22 }]);
  o.fire("pointermove", move(canvas, 32, 42)); // throttled
  assert.strictEqual(o.sends.length, 0);
  now = 130;
  o.fire("pointermove", move(canvas, 32, 42));
  assert.strictEqual(o.sends.pop()[1].tag, "canvas");
  now = 260;
  o.fire("pointermove", move(svg, 52, 62));
  assert.strictEqual(o.sends.pop()[1].tag, "svg");
  now = 390;
  o.fire("pointermove", move(qr, 72, 82));
  assert.strictEqual(o.sends.pop()[1].tag, "qr");
  now = 520;
  o.fire("pointermove", move(element("div", { left: 0, top: 0, width: 200, height: 200 }), 90, 90));
  assert.deepStrictEqual(plain(o.sends.pop()), ["qrHover", { clear: true }]);
  o.fire("blur", {}); // already clear: no duplicate
  assert.strictEqual(o.sends.length, 0);
  o.fire("pointermove", move(img, 92, 93));
  assert.strictEqual(o.sends.pop()[1].tag, "img");
  o.fire("pointermove", move(img, 93, 94)); // dedupe/throttle
  assert.strictEqual(o.sends.length, 0);
  now = 650;
  o.sandbox.scrollX = 100; o.sandbox.scrollY = 50;
  o.fire("pointermove", move(img, 100, 110)); // rect is in document coordinates, cursor stays in viewport coordinates
  assert.deepStrictEqual(plain(o.sends.pop()), ["qrHover", { x: 110, y: 70, width: 100, height: 100, tag: "img", cx: 100, cy: 110 }]);
}

function staticGuards() {
  const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const overlay = read("scripts/overlay/qrhover.js");
  assert.ok(overlay.includes('typeof ipcRenderer !== "undefined"'));
  assert.ok(overlay.includes('document.addEventListener("pointermove"'));
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|innerHTML/.test(overlay));
  assert.ok(read("scripts/build-preload.js").includes('js += overlay("qrhover.js");'));
  const main = read("main/qrhover.js");
  assert.ok(main.includes("tabs.byContents(e.sender)"));
  assert.ok(main.includes("capturePage(job.rect)"));
  assert.ok(main.includes('ui.push("qrDecoded"'));
}

(async () => {
  await mainHandlerTests();
  overlayTests();
  staticGuards();
  // qrcode is a runtime dependency that is not installed in every test checkout; stub only that module.
  const Module = require("module");
  const originalLoad = Module._load;
  const fakeQr = {
    toDataURL: async () => "data:image/png;base64,AAAA",
    toString: async (text, opts) => {
      assert.strictEqual(opts.type, "svg");
      return `<svg data-text="${text}"></svg>`;
    },
  };
  Module._load = function (request, parent, isMain) {
    if (request === "qrcode") return fakeQr;
    return originalLoad.call(this, request, parent, isMain);
  };
  let svg;
  try { svg = await require("../main/qr").svg("https://example.com/qr"); }
  finally { Module._load = originalLoad; }
  assert.ok(typeof svg === "string" && svg.startsWith("<svg"));
  assert.ok(svg.includes("</svg>"));
  console.log("qr hover ok");
})().catch(e => { console.error(e); process.exitCode = 1; });
