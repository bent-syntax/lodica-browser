"use strict";
// Hover-to-decode for QR images. Main only crops a trusted tab's pixels and decodes them locally.
const { ipcMain } = require("electron");
const { decodeImage } = require("./qrdecode");

const MIN_SIDE = 24, MAX_SIDE = 1024, THROTTLE_MS = 120, MAX_PER_SEC = 12;
const TAGS = new Set(["img", "canvas", "svg", "qr"]);
/** A QR holding a bare domain such as "beermap.be" is a web link: add the scheme so it opens like one. */
const withScheme = (t) => (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(t) ? "https://" + t : t);
const safeLink = (u) => { const s = String(u || "").trim(); return s.length <= 2000 && /^(https?:|lodica:|mailto:|tel:)/i.test(s); };

// The UI calls setHold while the pointer is on the tooltip's link/Copy button so a delayed clear cannot pull it away.
// Only one QR tooltip is visible at a time, so hold is tracked for the page that owns it.
let holdSetter = null;
function setHold(v) { if (holdSetter) holdSetter(!!v); }

const invalidators = new Set();
/** Navigation makes a cached decode meaningless: drop it so the old link cannot be opened on the new page. */
function invalidate(wc) { for (const fn of invalidators) { try { fn(wc); } catch {} } }

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

function init({ tabs, ui, now = Date.now, clearDelay = 300 } = {}) {
  if (!tabs || !ui) return;
  const latest = new WeakMap(), pending = new Map(), state = new WeakMap();
  const decoded = new WeakMap(), clearTimers = new Map(), byWc = new WeakMap();
  let inFlight = false, activeSender = null, heldSender = null;

  const push = (url, point, page, anchor) => ui.push("qrDecoded", Object.assign({ url, x: point ? point.x : 0, y: point ? point.y : 0, page: !!page }, anchor ? { anchor } : {}));
  const bump = sender => { const n = (latest.get(sender) || 0) + 1; latest.set(sender, n); return n; };

  holdSetter = (on) => {
    const sender = activeSender;
    heldSender = on ? sender : null;
    if (!on && sender && clearTimers.has(sender)) scheduleClear(sender);
  };

  /** Clear is delayed: crossing an element edge inside the same QR used to close and reopen the tooltip on every move. */
  function scheduleClear(sender) {
    const old = clearTimers.get(sender);
    if (old) clearTimeout(old);
    const seq = latest.get(sender) || 0;
    const finish = () => {
      clearTimers.delete(sender);
      // Keep the tooltip while the pointer is on its Copy/Open controls; check again shortly after release.
      if (heldSender === sender) {
        if (clearDelay > 0) clearTimers.set(sender, setTimeout(finish, clearDelay));
        return;
      }
      if ((latest.get(sender) || 0) !== seq) return;
      decoded.set(sender, "");
      echo(sender, "", "");
      if (activeSender === sender) activeSender = null;
      push("", null, true);
    };
    if (clearDelay <= 0) finish();
    else clearTimers.set(sender, setTimeout(finish, clearDelay));
  }
  function cancelClear(sender) {
    const old = clearTimers.get(sender);
    if (old) clearTimeout(old);
    clearTimers.delete(sender);
  }
  // The link box is drawn inside the page (no overlay window, so the page keeps focus and pointer); it takes the browser colours.
  const HEX = /^#[0-9a-f]{3,8}$/i;
  const themeOf = () => { const t = global.lodicaTheme || {}; const c = (v, d) => (typeof v === "string" && HEX.test(v) ? v : d); return { bg: c(t.bg, "#17181B"), text: c(t.text, "#ECEDEE"), muted: c(t.muted, "#A0A4AB") }; };
  function echo(sender, key, text, nonce) {
    const url = safeLink(text) ? String(text).trim() : "";
    try { if (sender && typeof sender.send === "function") sender.send("qrResult", { key: key || "", nonce: nonce || "", url, theme: themeOf() }); } catch {}
  }

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
    byWc.set(job.wc, sender);
    inFlight = true;
    Promise.resolve().then(() => run(job)).then(
      raw => {
        if (latest.get(sender) !== job.seq) return; // a newer crop has already replaced this one
        const text = withScheme(String(raw || "").trim());
        decoded.set(sender, text);
        echo(sender, job.key, text, job.nonce);
        cancelClear(sender);
        if (text) activeSender = sender;
        else { if (activeSender === sender) activeSender = null; scheduleClear(sender); }
      },
      () => {
        if (latest.get(sender) !== job.seq) return;
        decoded.set(sender, "");
        echo(sender, job.key, "", job.nonce);
        if (activeSender === sender) activeSender = null;
        push("", job.point, true);
      },
    ).finally(() => { inFlight = false; pump(); });
  }

  invalidators.clear();
  invalidators.add((wc) => {
    const sender = wc && byWc.get(wc);
    if (!sender || !decoded.has(sender)) return;
    cancelClear(sender);
    pending.delete(sender);
    bump(sender);
    decoded.delete(sender);
    echo(sender, "", "");
    if (activeSender === sender) activeSender = null;
    push("", null, true);
  });

  ipcMain.on("qrHover", (e, d) => {
    const tab = tabs.byContents(e.sender);
    const wc = tab && tab.view && tab.view.webContents;
    if (!wc || wc.isDestroyed()) return;

    if (d && d.clear === true) {
      bump(e.sender);
      pending.delete(e.sender);
      if (activeSender === e.sender) activeSender = null;
      scheduleClear(e.sender);
      return;
    }
    const tag = d && d.tag;
    if (tag != null && (!TAGS.has(String(tag)))) return;

    // A throttled re-hover must still cancel a pending clear, or a 300 ms timer hides a tooltip the pointer is back on.
    cancelClear(e.sender);
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
    if (!rect) { bump(e.sender); pending.delete(e.sender); scheduleClear(e.sender); return; }

    let bounds = { x: 0, y: 0, width: size.width, height: size.height };
    try { if (tab.view.getBounds) bounds = tab.view.getBounds() || bounds; } catch { /* gone */ }
    const point = cursorPoint(d, bounds, bounds);
    const seq = bump(e.sender);
    // Where the QR sits in window coordinates, so the link box can open right above it.
    const anchor = Number.isFinite(d.vx) && Number.isFinite(d.vy) ? { x: Math.round(d.vx + (bounds.x || 0)), y: Math.round(d.vy + (bounds.y || 0)), w: rect.width, h: rect.height } : null;
    pending.set(e.sender, { sender: e.sender, wc, rect, point, anchor, seq, key: String(d.key || ""), nonce: String(d.nonce || "") });
    pump();
  });

  // A click on the QR image itself opens the last decoded payload for that page. Only the page script can send this,
  // and only after main confirmed the crop was a URL, so an ordinary image link keeps its normal behaviour.
  ipcMain.on("qrClick", (e) => {
    const text = String(decoded.get(e.sender) || "").trim();
    if (!safeLink(text)) return;
    ui.push("qrDecodedOpen", text);
  });

}

module.exports = { init, invalidate, clampRect, cursorPoint, safeLink, setHold };
