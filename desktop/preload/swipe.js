"use strict";
// Two-finger touchpad swipe back/forward. Its own preload (registered per session in main.js) because
// preload/content.js is regenerated from the Android helper at build time, which dropped this code in 1.13.57 and 1.13.58.
const { ipcRenderer } = require("electron");
if (window === window.top) {
  // Two fingers sideways on a touchpad: an arrow is pulled out of the side while you move, and history goes back/forward
  // when you let go, if the arrow was pulled far enough.
  let sum = 0, sy = 0, last = 0, done = false, arrow = null, idle = 0, theme = null;
  let prev = 0, run = 0, peak = 0, armed = false;
  const LIMIT = 100;
  // Near the start position small jitter or overshoot on the way back must not count as a pull.
  const DEAD = 15;
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
  const gone = () => { if (arrow) arrow.remove(); };
  const reset = () => { clearTimeout(idle); sum = 0; sy = 0; prev = 0; run = 0; peak = 0; done = false; armed = false; gone(); };
  const draw = (p, back) => {
    if (!document.documentElement) return;
    const bg = (theme && theme.bg) || "#1F2937", fg = (theme && theme.amber) || "#F59E0B", full = p >= LIMIT;
    if (!arrow) {
      arrow = document.createElement("div");
      arrow.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
    }
    const e = Math.min(1, p / LIMIT);
    // The pull "charges up" purely as a visual cue (no extra function): it grows and glows more the farther it goes.
    const glow = Math.round(4 + 22 * e), scale = (1 + 0.22 * e).toFixed(2);
    // Past the limit the arrow fills in: letting go now goes back (or forward).
    arrow.setAttribute("style", "position:fixed;top:50%;z-index:2147483647;width:44px;height:44px;margin-top:-22px;border-radius:50%;box-sizing:border-box;background:" + (full ? fg : bg) +
      ";color:" + (full ? bg : fg) + ";border:1.5px solid " + fg + ";display:flex;align-items:center;justify-content:center;pointer-events:none;transform:scale(" + scale + ");" +
      "box-shadow:0 4px 12px rgba(0,0,0,.4), 0 0 " + glow + "px " + fg);
    if (!arrow.isConnected) document.documentElement.appendChild(arrow);
    const off = Math.round(-44 + 72 * e);
    arrow.style.left = back ? off + "px" : "auto";
    arrow.style.right = back ? "auto" : off + "px";
    arrow.firstChild.style.transform = back ? "" : "scaleX(-1)";
    arrow.style.opacity = String(Math.max(.25, e));
  };
  // Fingers up: go when the arrow is full. The rest of the gesture (momentum) is ignored.
  const release = () => {
    if (done) return;
    done = true; clearTimeout(idle);
    const go = Math.abs(sum) >= LIMIT && Math.abs(sum) > Math.abs(sy) * 1.5, dir = sum < 0 ? "back" : "forward";
    gone();
    if (go) ipcRenderer.send("swipe", { dir });
  };
  window.addEventListener("wheel", e => {
    if (e.ctrlKey) return;
    const now = Date.now(), gap = now - last, dx = e.deltaX;
    last = now;
    // A finished gesture is over after a short quiet moment, or a turn around. One that has not finished (fingers still on the pad,
    // maybe holding still) keeps its pull for a long while.
    if (gap > (done ? 250 : 1500) || (done && dx && sum && Math.sign(dx) !== Math.sign(sum) && Math.abs(dx) > 8)) { reset(); askTheme(); }
    ipcRenderer.send("swipe", { dx: Math.round(dx), dy: Math.round(e.deltaY), sum: Math.round(sum), shift: e.shiftKey });
    if (done) return;
    clearTimeout(idle);
    if (dx && canScroll(e.target, dx)) { sum = 0; sy = 0; return; }
    // The fingers have lifted when a zero movement arrives. After that the touchpad keeps sending smoothly shrinking steps
    // (momentum): eight in a row, each a little smaller than the one before and well below the strongest step, are also taken as
    // lifted. Holding still never counts: with the fingers on the pad nothing arrives at all, and that must not go back or forward.
    const a = Math.abs(dx);
    if (!dx && !e.deltaY && sum) { release(); return; }
    run = prev && a <= prev && a >= prev * .93 ? run + 1 : 0;
    prev = a; peak = Math.max(peak, a);
    sum += dx; sy += e.deltaY;
    // Back inside the dead zone around the start: drop the pull so a return-and-overshoot starts a fresh count
    // instead of carrying old momentum into the other direction.
    if (Math.abs(sum) < DEAD) {
      if (armed) { sum = 0; sy = 0; peak = 0; run = 0; prev = 0; gone(); }
      armed = false;
      return;
    }
    armed = true;
    if (Math.abs(sum) <= Math.abs(sy) * 1.5) return;
    draw(Math.abs(sum), sum < 0);
    // Momentum carries on in the direction of the pull. Steps that go back toward where the fingers started are not a release:
    // the arrow shrinks with them, and it only goes when the fingers lift while the pull is still far enough from the start.
    if (run >= 8 && a < peak * .85 && Math.sign(dx) === Math.sign(sum)) { release(); return; }
    // No more movement for a while and no lift seen: let the pull go without navigating.
    idle = setTimeout(() => { done = true; gone(); }, 1500);
  }, { capture: true, passive: true });
}
