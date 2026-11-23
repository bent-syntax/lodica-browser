"use strict";
// Hover-to-decode for QR images. Main only crops a trusted tab's pixels and decodes them locally.
const { ipcMain } = require("electron");
const { decodeImage } = require("./qrdecode");

const MIN_SIDE = 24, MAX_SIDE = 1024, THROTTLE_MS = 120, MAX_PER_SEC = 12;
const TAGS = new Set(["img", "canvas", "svg", "qr"]);

function clampRect(d) {
  if (!d || ![d.x, d.y, d.width, d.height].every(Number.isFinite)) return null;
  const x = Math.max(0, Math.round(d.x)), y = Math.max(0, Math.round(d.y));
  const width = Math.round(d.width), height = Math.round(d.height);
  if (width < MIN_SIDE || height < MIN_SIDE) return null;
  return { x, y, width: Math.min(width, MAX_SIDE), height: Math.min(height, MAX_SIDE) };
}

/** Viewport cursor coordinates -> window coordinates (the UI layer spans the window). */
function cursorPoint(d, origin, max) {
  const x = Number.isFinite(d && d.cx) ? d.cx + (origin.x || 0) : Number.isFinite(d && d.x) ? d.x + (origin.x || 0) : 0;
  const y = Number.isFinite(d && d.cy) ? d.cy + (origin.y || 0) : Number.isFinite(d && d.y) ? d.y + (origin.y || 0) : 0;
  const clampedX = Math.min(Math.max(0, Math.round(x)), Math.max(0, (max && max.width) || x));
  const clampedY = Math.min(Math.max(0, Math.round(y)), Math.max(0, (max && max.height) || y));
  return { x: clampedX, y: clampedY };
}

function init({ tabs, ui, now = Date.now } = {}) {
  if (!tabs || !ui) return;
  const latest = new WeakMap(), pending = new Map(), state = new WeakMap();
  let inFlight = false;

  const push = (url, point) => ui.push("qrDecoded", { url, x: point ? point.x : 0, y: point ? point.y : 0 });
  const bump = sender => { const n = (latest.get(sender) || 0) + 1; latest.set(sender, n); return n; };

  async function run(job) {
    if (!job.wc || job.wc.isDestroyed()) return null;
    try {
      const img = await job.wc.capturePage(job.rect);
      return img && !img.isEmpty() ? decodeImage(img) : null;
    } catch { return null; }
  }

  function pump() {
    if (inFlight || !pending.size) return;
    const sender = pending.keys().next().value, job = pending.get(sender);
    pending.delete(sender);
    inFlight = true;
    Promise.resolve().then(() => run(job)).then(
      text => { if (latest.get(sender) === job.seq) push(text || "", job.point); },
      () => { if (latest.get(sender) === job.seq) push("", job.point); },
    ).finally(() => { inFlight = false; pump(); });
  }

  ipcMain.on("qrHover", (e, d) => {
    const tab = tabs.byContents(e.sender);
    const wc = tab && tab.view && tab.view.webContents;
    if (!wc || wc.isDestroyed()) return;

    if (d && d.clear === true) {
      bump(e.sender);
      pending.delete(e.sender);
      push("");
      return;
    }
    const tag = d && d.tag;
    if (tag != null && (!TAGS.has(String(tag)))) return;

    const t = now();
    const st = state.get(e.sender) || { at: 0, window: t, count: 0 };
    if (t - st.at < THROTTLE_MS) return;
    if (t - st.window >= 1000) { st.window = t; st.count = 0; }
    if (st.count >= MAX_PER_SEC) return;
    st.at = t; st.count++;
    state.set(e.sender, st);

    let size = { width: 0, height: 0 };
    try { size = wc.getSize() || size; } catch { /* gone */ }
    const rect = clampRect(d);
    if (!rect) { bump(e.sender); pending.delete(e.sender); push(""); return; }

    let bounds = { x: 0, y: 0, width: size.width, height: size.height };
    try { if (tab.view.getBounds) bounds = tab.view.getBounds() || bounds; } catch { /* gone */ }
    const point = cursorPoint(d, bounds, bounds);
    const seq = bump(e.sender);
    pending.set(e.sender, { sender: e.sender, wc, rect, point, seq });
    pump();
  });
}

module.exports = { init, clampRect, cursorPoint };
