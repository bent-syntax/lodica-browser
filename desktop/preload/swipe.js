"use strict";
// Two-finger touchpad swipe back/forward. Its own preload (registered per session in main.js) because
// preload/content.js is regenerated from the Android helper at build time, which dropped this code in 1.13.57 and 1.13.58.
const { ipcRenderer } = require("electron");
if (window === window.top) {
  // Two fingers sideways on a touchpad: an arrow grows at the edge, and past the limit history goes back/forward.
  let sum = 0, sy = 0, last = 0, lock = 0, arrow = null, hide = 0;
  const LIMIT = 100;
  const canScroll = (el, dx) => {
    for (; el && el !== document.documentElement; el = el.parentElement) {
      const o = getComputedStyle(el).overflowX;
      if ((o === "auto" || o === "scroll") && el.scrollWidth > el.clientWidth + 1) {
        if (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
      }
    }
    return false;
  };
  const draw = (p, back) => {
    if (!document.documentElement) return;
    if (!arrow) {
      arrow = document.createElement("div");
      arrow.setAttribute("style", "position:fixed;top:50%;z-index:2147483647;width:44px;height:44px;margin-top:-22px;border-radius:50%;background:#1F2937;color:#F59E0B;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.4);transition:opacity .15s");
      arrow.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
    }
    if (!arrow.isConnected) document.documentElement.appendChild(arrow);
    const e = Math.min(1, p / LIMIT), off = Math.round(-44 + 72 * e);
    arrow.style.left = back ? off + "px" : "auto";
    arrow.style.right = back ? "auto" : off + "px";
    arrow.firstChild.style.transform = back ? "" : "scaleX(-1)";
    arrow.style.opacity = String(Math.max(.25, e));
    // Like Firefox: navigate when the fingers let go (wheel events stop), if the arrow was pulled past the limit.
    clearTimeout(hide); hide = setTimeout(() => {
      const go = Math.abs(sum) >= LIMIT, dir = sum < 0 ? "back" : "forward";
      sum = 0; sy = 0; arrow && arrow.remove();
      if (go) { lock = Date.now() + 700; ipcRenderer.send("swipe", { dir }); }
    }, 160);
  };
  window.addEventListener("wheel", e => {
    const now = Date.now();
    if (now < lock || e.ctrlKey) return;
    if (now - last > 200) { sum = 0; sy = 0; }
    last = now;
    ipcRenderer.send("swipe", { dx: Math.round(e.deltaX), dy: Math.round(e.deltaY), sum: Math.round(sum), shift: e.shiftKey });
    if (e.deltaX && canScroll(e.target, e.deltaX)) { sum = 0; sy = 0; return; }
    sum += e.deltaX; sy += e.deltaY;
    if (Math.abs(sum) <= Math.abs(sy) * 1.5) return;
    draw(Math.abs(sum), sum < 0);
  }, { capture: true, passive: true });
}
