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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stripNonce = (v) => { const c = plain(v); if (c[1] && c[1].nonce) delete c[1].nonce; return c; };

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
  const echoes = [], sender = { send: (...a) => echoes.push(a) };
  qrhover.init({ tabs: { byContents: s => s === sender ? tab : null }, ui: { push: (ev, d) => pushes.push({ ev, d }) }, now: () => now, clearDelay: 0 });

  handlers.qrHover({ sender }, { x: 5, y: 6, width: 200, height: 200, tag: "img", cx: 10, cy: 20, key: "img|5|6|200|200|", nonce: "1000|1" });
  await flush();
  assert.strictEqual(captures, 1);
  assert.deepStrictEqual(captureRects[0], { x: 5, y: 6, width: 200, height: 200 });
  assert.strictEqual(pushes.length, 0, "a page QR is drawn inside the page, not in an overlay layer");
  const echo = echoes.pop();
  assert.strictEqual(echo[0], "qrResult");
  assert.strictEqual(echo[1].url, QR_TEXT);
  assert.ok(/^#[0-9a-f]{6}$/i.test(echo[1].theme.bg), "the echo carries the browser colours for the link box");
  assert.ok(echo[1].key && echo[1].nonce, "the echo identifies the exact crop");

  // Clicking the decoded QR opens the payload; an undecoded sender cannot trigger an open.
  handlers.qrClick({ sender: {} });
  assert.strictEqual(pushes.length, 0);
  handlers.qrClick({ sender });
  assert.deepStrictEqual(pushes.pop(), { ev: "qrDecodedOpen", d: QR_TEXT });

  // A page navigation drops the cached payload so an old QR link cannot open on the new page.
  qrhover.invalidate(wc);
  assert.deepStrictEqual(pushes.pop().d, { url: "", x: 0, y: 0, page: true });
  handlers.qrClick({ sender });
  assert.strictEqual(pushes.length, 0);

  now += 10;
  handlers.qrHover({ sender }, { x: 5, y: 6, width: 200, height: 200, tag: "svg", cx: 11, cy: 21 });
  await flush();
  assert.strictEqual(captures, 1); // throttled

  now += 130;
  handlers.qrHover({ sender }, { x: 7, y: 8, width: 200, height: 200, tag: "canvas", cx: 30, cy: 40 });
  await flush();
  assert.strictEqual(captures, 2);
  assert.strictEqual(echoes.pop()[1].url, QR_TEXT);

  const before = pushes.length;
  handlers.qrHover({ sender: {} }, { x: 1, y: 1, width: 100, height: 100, tag: "img", cx: 1, cy: 1 });
  await flush();
  assert.strictEqual(pushes.length, before); // unknown sender never reaches capturePage

  handlers.qrHover({ sender }, { clear: true });
  assert.deepStrictEqual(pushes.pop().d, { url: "", x: 0, y: 0, page: true });

  // Latest wins while a capture is in flight: only the newest rect may publish.
  const s2 = {}, resolvers = [], pushes2 = [];
  const wc2 = { isDestroyed: () => false, getSize: () => ({ width: 800, height: 600 }), capturePage: () => new Promise(r => resolvers.push(r)) };
  const tab2 = { view: { webContents: wc2, getBounds: () => ({ x: 0, y: 44, width: 800, height: 600 }) } };
  qrhover.init({ tabs: { byContents: s => s === s2 ? tab2 : null }, ui: { push: (ev, d) => pushes2.push(d) }, now: () => now, clearDelay: 0 });
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
  assert.deepStrictEqual(pushes2, []);
}

/** The delayed clear must survive a throttled re-hover and respect the tooltip's Copy/Open controls. */
async function delayedClearTests() {
  let now = 5000;
  const pushes = [];
  const wc = { isDestroyed: () => false, getSize: () => ({ width: 800, height: 600 }), capturePage: async () => fakeImage(FIXTURE) };
  const tab = { view: { webContents: wc, getBounds: () => ({ x: 0, y: 44, width: 800, height: 600 }) } };
  const sender = {};
  qrhover.init({ tabs: { byContents: s => s === sender ? tab : null }, ui: { push: (ev, d) => pushes.push(d) }, now: () => now, clearDelay: 100 });
  const hover = (x) => handlers.qrHover({ sender }, { x, y: 6, width: 100, height: 100, tag: "img", cx: x, cy: 20 });

  hover(1);
  await flush();
  assert.strictEqual(pushes.length, 0);
  qrhover.setHold(true);
  handlers.qrHover({ sender }, { clear: true });
  await sleep(150);
  assert.strictEqual(pushes.length, 0, 'holding Copy/Open keeps the tooltip open');
  qrhover.setHold(false);
  await sleep(150);
  assert.deepStrictEqual(pushes.pop(), { url: "", x: 0, y: 0, page: true });

  // Clear → re-hover inside the throttle window: the pending timer must be cancelled even though no new crop is sent.
  now += 10;
  hover(2);
  await flush();
  pushes.length = 0;
  now += 10;
  handlers.qrHover({ sender }, { clear: true });
  now += 10;
  hover(2);
  await flush();
  await sleep(160);
  assert.strictEqual(pushes.length, 0, 'a throttled re-hover must not let the old clear hide the tooltip');
  qrhover.setHold(false);
}

function loadOverlay(nowRef) {
  const sends = [], listeners = {}, ipc = {};
  const sandbox = {
    ipcRenderer: { send: (...a) => sends.push(a), on: (n, f) => { ipc[n] = f; } },
    window: {}, location: { protocol: "https:" }, scrollX: 0, scrollY: 0,
    document: {
      addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
      createElement: () => ({ style: {}, kids: [], textContent: "", offsetWidth: 200, offsetHeight: 40, appendChild(k) { this.kids.push(k); }, remove() { this.removed = true; } }),
      documentElement: { kids: [], appendChild(k) { this.kids.push(k); } },
    },
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    Date: { now: nowRef }, console, Math, Number, String,
  };
  sandbox.window.top = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "scripts", "overlay", "qrhover.js"), "utf8"), sandbox);
  return { sends, sandbox, fire: (name, ev) => { for (const f of listeners[name] || []) f(ev); },
    emit: (name, d) => { if (ipc[name]) ipc[name]({}, d); } };
}

function element(tag, rect, src = "") {
  const qr = tag === "qr";
  return {
    nodeType: 1, tagName: qr ? "DIV" : tag, currentSrc: src, parentElement: null,
    matches(sel) { return sel.split(",").map(s => s.trim()).some(s => s === "[data-qr]" ? qr : s.toLowerCase() === String(this.tagName).toLowerCase()); },
    hasAttribute(n) { return qr && n === "data-qr"; },
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
    getAttribute: () => null,
  };
}
const move = (el, x, y) => ({ target: el, composedPath: () => [el], clientX: x, clientY: y });
const plain = v => JSON.parse(JSON.stringify(v)); // VM objects have a different prototype.

const press = (el, x, y) => ({ target: el, composedPath: () => [el], clientX: x, clientY: y, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });

function overlayTests() {
  let now = 0;
  const o = loadOverlay(() => now);
  const img = element("img", { left: 10, top: 20, width: 100, height: 100 }, "https://example.com/qr.png");
  const canvas = element("canvas", { left: 30, top: 40, width: 120, height: 120 });
  const svg = element("svg", { left: 50, top: 60, width: 140, height: 140 });
  const qr = element("qr", { left: 70, top: 80, width: 64, height: 64 });

  // Hovering sends nothing: the decode only starts on a click.
  o.fire("pointermove", move(img, 12, 22));
  assert.strictEqual(o.sends.length, 0);

  let e = press(img, 12, 22);
  o.fire("click", e);
  assert.strictEqual(e.prevented, undefined, "the first click still reaches the page");
  assert.deepStrictEqual(stripNonce(o.sends.pop()), ["qrHover", { x: 10, y: 20, width: 100, height: 100, tag: "img", cx: 12, cy: 22, key: "img|10|20|100|100|https://example.com/qr.png", vx: 10, vy: 20 }]);
  o.fire("pointermove", move(img, 40, 50)); // still on the QR: the box stays
  assert.strictEqual(o.sends.length, 0);
  o.fire("click", press(img, 13, 23)); // decode still running: no second request
  assert.strictEqual(o.sends.length, 0);
  o.fire("click", press(canvas, 32, 42));
  assert.strictEqual(o.sends.pop()[1].tag, "canvas");
  o.fire("click", press(svg, 52, 62));
  assert.strictEqual(o.sends.pop()[1].tag, "svg");
  o.fire("click", press(qr, 72, 82));
  assert.strictEqual(o.sends.pop()[1].tag, "qr");
  o.fire("click", press(element("div", { left: 0, top: 0, width: 200, height: 200 }), 90, 90));
  assert.deepStrictEqual(plain(o.sends.pop()), ["qrHover", { clear: true }]);
  o.fire("blur", {}); // already clear: no duplicate
  assert.strictEqual(o.sends.length, 0);
  o.fire("click", press(img, 92, 93));
  assert.strictEqual(o.sends.pop()[1].tag, "img");
  o.fire("scroll", {}); // scrolling hides the tooltip
  assert.deepStrictEqual(plain(o.sends.pop()), ["qrHover", { clear: true }]);
  o.sandbox.scrollX = 100; o.sandbox.scrollY = 50;
  o.fire("click", press(img, 100, 110)); // rect is in document coordinates, cursor stays in viewport coordinates
  assert.deepStrictEqual(stripNonce(o.sends.pop()), ["qrHover", { x: 110, y: 70, width: 100, height: 100, tag: "img", cx: 100, cy: 110, key: "img|110|70|100|100|https://example.com/qr.png", vx: 10, vy: 20 }]);
  o.fire("pointermove", move(img, 500, 500)); // the cursor left the QR
  assert.deepStrictEqual(plain(o.sends.pop()), ["qrHover", { clear: true }]);
}

function overlayClickTests() {
  let now = 0;
  const o = loadOverlay(() => now);
  const img = element("img", { left: 10, top: 20, width: 100, height: 100 }, "https://example.com/qr.png");
  const other = element("img", { left: 10, top: 20, width: 100, height: 100 }, "https://example.com/other.png");
  const click = (el = img) => press(el, 30, 40);

  // First click: asks main to decode, and the click passes through to the page.
  let e = click();
  o.fire("click", e);
  assert.strictEqual(e.prevented, undefined);
  const hover = o.sends.pop()[1];

  // A result for another crop or without a nonce must not be reused.
  for (const bad of [
    { key: "img|0|0|1|1|", nonce: hover.nonce, url: QR_TEXT },
    { key: hover.key, url: QR_TEXT },
    { key: "", nonce: hover.nonce, url: QR_TEXT },
  ]) {
    o.emit("qrResult", bad);
    e = click();
    o.fire("click", e);
    assert.strictEqual(e.prevented, undefined);
    assert.strictEqual(o.sends.length, 0);
  }

  // Second click on the confirmed image opens the link; the confirmed link shows in a box above the QR.
  o.emit("qrResult", { key: hover.key, nonce: hover.nonce, url: QR_TEXT, theme: { bg: "#17181B", text: "#ECEDEE", muted: "#A0A4AB" } });
  const boxEl = o.sandbox.document.documentElement.kids[0];
  assert.ok(boxEl && boxEl.kids[0].textContent === QR_TEXT, "link box shown");
  assert.strictEqual(boxEl.style.background, "#17181B", "opaque browser background");
  assert.strictEqual(boxEl.style.top, "126px", "no room above: placed below the QR");
  o.fire("pointermove", move(img, 40, 50)); // still on the QR
  assert.ok(!boxEl.removed, "box stays while the pointer is on the QR");
  e = click();
  o.fire("click", e);
  assert.strictEqual(e.prevented, true);
  assert.strictEqual(e.stopped, true);
  assert.deepStrictEqual(plain(o.sends.pop()), ["qrClick", { url: QR_TEXT }]);

  // A different image is a first click of its own: not intercepted, decode requested.
  e = click(other);
  o.fire("click", e);
  assert.strictEqual(e.prevented, undefined, "a click on another element is not intercepted");
  assert.strictEqual(o.sends.pop()[0], "qrHover");

  // A decoded non-link payload never opens or blocks a click.
  e = click();
  o.fire("click", e);
  const again = o.sends.pop()[1];
  o.emit("qrResult", { key: again.key, nonce: again.nonce, url: "plain text" });
  e = click();
  o.fire("click", e);
  assert.strictEqual(e.prevented, undefined);
  assert.strictEqual(o.sends.length, 0);
}

function uiDecodedLinkTests() {
  const calls = [];
  function node(tag, attrs, kids) {
    const el = {
      tag, attrs: { ...(attrs || {}) }, kids: [], listeners: {}, parentNode: null,
      style: {}, offsetWidth: 260, offsetHeight: 72,
      classList: {
        toggle(c, on) { const set = new Set(String(el.attrs.class || "").split(/\s+/).filter(Boolean)); const add = on === undefined ? !set.has(c) : !!on; if (add) set.add(c); else set.delete(c); el.attrs.class = [...set].join(" "); },
        add(c) { this.toggle(c, true); }, remove(c) { this.toggle(c, false); },
      },
      append(...items) { for (const k of items) if (k && typeof k === "object") { k.parentNode = el; el.kids.push(k); } },
      replaceChild(next, old) { const i = el.kids.indexOf(old); if (i >= 0) el.kids[i] = next; next.parentNode = el; old.parentNode = null; },
      querySelectorAll(sel) {
        const want = sel.split(",").flatMap(s => s.trim().split(".").filter(Boolean));
        const hit = (n) => want.every(c => String(n.attrs.class || "").split(/\s+/).includes(c));
        const out = [];
        const walk = (n) => { for (const k of n.kids || []) { if (hit(k)) out.push(k); walk(k); } };
        walk(el);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      addEventListener(n, f) { (el.listeners[n] = el.listeners[n] || []).push(f); },
      removeAttribute(n) { delete el.attrs[n]; },
      setAttribute(k, v) { el.attrs[k] = v; },
      focus() {}, select() {},
    };
    for (const k of kids || []) if (k && typeof k === "object") el.append(k);
    return el;
  }
  function h(tag, attrs, ...kids) {
    const el = node(tag, {}, kids);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "on") for (const ev in v) el.addEventListener(ev, v[ev]);
      else if (k === "act") el.act = v;
      else if (k === "data") el.dataset = { ...v };
      else el.attrs[k] = v; // class, text, href, title, rel, style, ...
    }
    return el;
  }
  const sandbox = {
    h,
    openLayer(opts, build) {
      const body = build();
      const el = node("div", { class: "layer" }, [body]); // the real openLayer returns a wrapper around the card
      const layer = { el, body, closed: false, close() { layer.closed = true; if (opts.onClose) opts.onClose(); } };
      return layer;
    },
    inv(...args) { calls.push(args); return Promise.resolve(null); },
    toast() {}, console, Math, Number, String, Promise, setTimeout, clearTimeout,
    innerWidth: 800, innerHeight: 600,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "ui", "js", "qr.js"), "utf8"), sandbox);
  const read = expr => vm.runInContext(expr, sandbox);
  assert.strictEqual(typeof sandbox.showQrHover, "undefined"); // link hover no longer renders a QR
  assert.strictEqual(typeof sandbox.showQrDecoded, "function");

  sandbox.showQrDecoded({ url: QR_TEXT, x: 10, y: 20 });
  let layer = read("QR_DECODE");
  const findAnchor = (l) => l.body.kids.find(k => k.tag === "a");
  let anchor = findAnchor(layer);
  assert.ok(anchor, "decoded URL must be a real anchor");
  assert.strictEqual(anchor.attrs.href, QR_TEXT);
  assert.strictEqual(anchor.attrs.class, "qr-url qr-open");
  anchor.listeners.click[0]({ preventDefault() {} });
  assert.deepStrictEqual(plain(calls.pop()), ["tab.new", { url: QR_TEXT }]);
  assert.strictEqual(layer.closed, true);

  sandbox.showQrDecoded({ url: "not a link", x: 30, y: 40 });
  layer = read("QR_DECODE");
  assert.ok(layer.body.kids.every(k => k.tag !== "a"), "plain QR text stays exact text");

  // Switching between page and generator tooltips must not leave the click-through class on the card.
  sandbox.showQrDecoded({ url: QR_TEXT, x: 10, y: 20, page: true });
  layer = read("QR_DECODE");
  assert.ok(layer.el.attrs.class.includes("qr-page-layer"));
  assert.ok(layer.body.attrs.class.includes("qr-page"));
  sandbox.showQrDecoded({ url: QR_TEXT, x: 10, y: 20, page: false });
  layer = read("QR_DECODE");
  assert.ok(!layer.el.attrs.class.includes("qr-page-layer"));
  assert.ok(!layer.body.attrs.class.includes("qr-page"));

  sandbox.showQrDecoded({ url: "mailto:someone@example.com", x: 40, y: 50 });
  anchor = findAnchor(read("QR_DECODE"));
  assert.ok(anchor);
  anchor.listeners.click[0]({ preventDefault() {} });
  assert.deepStrictEqual(plain(calls.pop()), ["openExternal", "mailto:someone@example.com"]);

  sandbox.showQrDecoded({ url: "", x: 0, y: 0 });
  assert.strictEqual(read("QR_DECODE"), null);
}

function staticGuards() {
  const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const overlay = read("scripts/overlay/qrhover.js");
  assert.ok(overlay.includes('typeof ipcRenderer !== "undefined"'));
  assert.ok(overlay.includes('document.addEventListener("click"') && overlay.includes('lastRect.left - pad'));
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|innerHTML/.test(overlay));
  assert.ok(read("scripts/build-preload.js").includes('js += overlay("qrhover.js");'));
  const main = read("main/qrhover.js");
  assert.ok(main.includes("tabs.byContents(e.sender)"));
  assert.ok(main.includes("capturePage(job.rect)"));
  assert.ok(main.includes('ui.push("qrDecoded"'));
  assert.ok(main.includes('ui.push("qrDecodedOpen"') && overlay.includes('send("qrClick"'));
  assert.ok(!/pointerleave", clear, true/.test(overlay));
  assert.ok(overlay.includes('lastNonce') && main.includes('job.nonce'));
  assert.ok(main.includes('invalidate(wc)') && read("main/tabs.js").includes('require("./qrhover").invalidate(wc)'));
  assert.ok(qrhover.safeLink(" https://example.com/a ") && !qrhover.safeLink("mailtoevil:x@y.z"));
  const generated = read("preload/content.js");
  assert.ok(generated.includes('send("qrClick"') && generated.includes('on("qrResult"'));
  const ui = read("ui/js/qr.js");
  assert.ok(!/function showQrHover/.test(ui));
  assert.ok(!read("ui/js/main.js").includes('on("hover", showQrHover)'));
  assert.ok(!read("main/tabs.js").includes("update-target-url"));
  assert.ok(ui.includes('inv("tab.new"') && ui.includes('inv("openExternal"'));
}

(async () => {
  await mainHandlerTests();
  await delayedClearTests();
  overlayTests();
  overlayClickTests();
  uiDecodedLinkTests();
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
