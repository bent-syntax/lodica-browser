// Bridge to the renderer bar (ui/): command registry, events, layout, prompts and toasts.
const { ipcMain } = require("electron");

const BAR = 58;
const TOP = 36; // tab strip above the page
const COLLAPSED = 44; // vertical panel when collapsed
const handlers = new Map();
const waits = new Map(); // id -> resolve
let win = null, view = null, top = null, divider = null, mode = "bar", seq = 0, ready = false, topReady = false;
let refocus = () => {};
const queue = [];

function init(window, uiView) {
  win = window; view = uiView;
  view.webContents.on("did-start-loading", () => { ready = false; });
  view.webContents.on("did-finish-load", () => {
    ready = true;
    while (queue.length) push(...queue.shift());
  });
  ipcMain.handle("ui", async (e, cmd, ...args) => {
    if (e.sender !== view.webContents && e.sender !== top?.webContents && e.sender !== divider?.webContents) throw new Error("Forbidden");
    const fn = handlers.get(cmd);
    if (!fn) throw new Error("Unknown command " + cmd);
    return fn(...args);
  });
  handle("layout", m => layout(m));
  handle("prompt.answer", (id, result) => answer(id, result));
}

/** Register the tab strip view (same bridge, same commands, receives every event). */
function initTop(topView) {
  top = topView;
  top.webContents.on("did-start-loading", () => { topReady = false; });
  top.webContents.on("did-finish-load", () => { topReady = true; });
}

/** Register the split-view divider (same bridge, receives every event once loaded). */
function initDivider(v) { divider = v; }

function handle(cmd, fn) { handlers.set(cmd, fn); }

function push(event, data) {
  const wc = view?.webContents;
  if (!wc || wc.isDestroyed()) return;
  if (!ready) { if (queue.length < 100) queue.push([event, data]); return; }
  wc.send("ui-event", event, data);
  if (top && topReady && !top.webContents.isDestroyed()) top.webContents.send("ui-event", event, data);
  if (divider && !divider.webContents.isDestroyed() && !divider.webContents.isLoading()) divider.webContents.send("ui-event", event, data);
}

function size() {
  const [width, height] = win.getContentSize();
  return { width, height };
}

/** Page area: the window minus the tab strip and the bar. */
function pageBounds() {
  const { width, height } = size();
  const left = sideWidth();
  if (left) return { x: left, y: 0, width: Math.max(0, width - left), height: Math.max(0, height - BAR) };
  return { x: 0, y: TOP, width, height: Math.max(0, height - BAR - TOP) };
}

/** Width of the vertical tab panel; 0 when the strip is horizontal. */
function sideWidth() {
  const p = require("./prefs").p;
  if (!p.vertTabs) return 0;
  return p.vertCollapsed ? COLLAPSED : Math.min(480, Math.max(160, p.vertWidth || 220));
}

function fit() {
  if (!win || win.isDestroyed() || !view) return;
  const { width, height } = size();
  const left = sideWidth();
  top?.setBounds(left ? { x: 0, y: 0, width: left, height: Math.max(0, height - BAR) } : { x: 0, y: 0, width, height: TOP });
  view.setBounds(mode === "overlay" ? { x: 0, y: 0, width, height } : { x: 0, y: Math.max(0, height - BAR), width, height: BAR });
}

function layout(m) {
  const was = mode;
  mode = m === "overlay" ? "overlay" : "bar";
  fit();
  if (mode === "overlay") view?.webContents.focus();
  else if (was === "overlay") refocus(); // keys must reach the page again once the overlay closes
}

function wait(id, ms) {
  return new Promise(resolve => {
    const timer = ms ? setTimeout(() => answer(id, false), ms) : null;
    waits.set(id, v => { if (timer) clearTimeout(timer); resolve(v); });
  });
}

function answer(id, result) {
  const done = waits.get(id);
  if (!done) return false;
  waits.delete(id);
  done(result);
  return true;
}

/** Show a toast; with an action label, resolves true when the action is tapped. */
function toast(text, action) {
  if (!action) { push("toast", { text }); return Promise.resolve(false); }
  const id = ++seq;
  push("toast", { text, action, id });
  return wait(id, 15000).then(v => !!v);
}

/** Show a modal prompt in the overlay; resolves with the renderer's answer. */
function prompt(opts) {
  const id = ++seq;
  layout("overlay");
  push("overlay", { on: true });
  push("prompt", {
    id, kind: opts.kind || "confirm", title: opts.title || "", message: opts.message || "",
    ok: opts.ok || "OK", cancel: opts.cancel || "Cancel", extra: opts.extra, options: opts.options,
    value: opts.value, user: opts.user,
  });
  return wait(id);
}

module.exports = { setRefocus: fn => { refocus = fn; }, BAR, TOP, init, initTop, initDivider, handle, push, layout, fit, pageBounds, sideWidth, toast, prompt, answer, get mode() { return mode; } };
