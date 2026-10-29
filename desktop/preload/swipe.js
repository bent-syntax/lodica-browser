"use strict";
// Two-finger touchpad swipe back/forward. Its own preload (registered per session in main.js) because
// preload/content.js is regenerated from the Android helper at build time, which dropped this code in 1.13.57 and 1.13.58.
const { ipcRenderer } = require("electron");
if (window === window.top) {
  // Two fingers sideways on a touchpad: an arrow grows at the edge, and past the limit history goes back/forward.
  let sum = 0, sy = 0, last = 0, done = false, arrow = null, hide = 0, theme = null;
  const LIMIT = 100;
  // Arrow colours follow the browser theme (main keeps the last colours the bar reported).
  const askTheme = () => { try { ipcRenderer.invoke("lodica-theme").then((t) => { theme = t; }, () => {}); } catch (e) { /* no theme */ } };
  askTheme();
  const canScroll = (el, dx) => {
    for (; el && el !== document.documentElement; el = el.parentElement) {
      const o = getComputedStyle(el).overflowX;
      if ((o === "auto" || o === "scroll") && el.scrollWidth > el.clientWidth + 1) {
        if (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
      }
    }
    return false;
  };
  const clear = () => { clearTimeout(hide); sum = 0; sy = 0; if (arrow) arrow.remove(); };
  const draw = (p, back) => {
    if (!document.documentElement) return;
    if (!arrow) {
      const bg = (theme && theme.bg) || "#1F2937", fg = (theme && theme.amber) || "#F59E0B";
      arrow = document.createElement("div");
      arrow.setAttribute("style", "position:fixed;top:50%;z-index:2147483647;width:44px;height:44px;margin-top:-22px;border-radius:50%;box-sizing:border-box;background:" + bg + ";color:" + fg + ";border:1.5px solid " + fg + ";display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.4);transition:opacity .15s");
      arrow.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
    }
    if (!arrow.isConnected) document.documentElement.appendChild(arrow);
    const e = Math.min(1, p / LIMIT), off = Math.round(-44 + 72 * e);
    arrow.style.left = back ? off + "px" : "auto";
    arrow.style.right = back ? "auto" : off + "px";
    arrow.firstChild.style.transform = back ? "" : "scaleX(-1)";
    arrow.style.opacity = String(Math.max(.25, e));
    clearTimeout(hide); hide = setTimeout(clear, 160);
  };
  window.addEventListener("wheel", e => {
    if (e.ctrlKey) return;
    const now = Date.now(), gap = now - last;
    last = now;
    // A new gesture starts after a quiet moment. Touchpad momentum keeps sending events for seconds after the fingers lift,
    // so navigate as soon as the limit is passed and ignore the rest of that gesture.
    if (gap > 250) { clear(); done = false; askTheme(); }
    ipcRenderer.send("swipe", { dx: Math.round(e.deltaX), dy: Math.round(e.deltaY), sum: Math.round(sum), shift: e.shiftKey });
    if (done) return;
    if (e.deltaX && canScroll(e.target, e.deltaX)) { sum = 0; sy = 0; return; }
    sum += e.deltaX; sy += e.deltaY;
    if (Math.abs(sum) <= Math.abs(sy) * 1.5) return;
    if (Math.abs(sum) >= LIMIT) { const dir = sum < 0 ? "back" : "forward"; done = true; clear(); ipcRenderer.send("swipe", { dir }); return; }
    draw(Math.abs(sum), sum < 0);
  }, { capture: true, passive: true });
}
