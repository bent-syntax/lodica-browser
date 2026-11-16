"use strict";
// Two-finger touchpad swipe back/forward. Its own preload (registered per session in main.js) because
// preload/content.js is regenerated from the Android helper at build time, which dropped this code in 1.13.57 and 1.13.58.
const { ipcRenderer } = require("electron");
if (window === window.top) {
  // Works like Firefox: a blob is pulled out of the side while the fingers move, and history goes back/forward when they lift
  // while the pull is past the line. Anywhere short of the line cancels; there is no spot that has to be hit exactly.
  // The blob is a metaball: a neck ties it to the edge, thins while it is pulled, and snaps when the pull is far enough.
  const LIMIT = 240;    // finger travel (px) for a full pull; Firefox needs about the same
  const START = 24;     // travel before the gesture picks a direction (sideways or not)
  const R = 20;         // circle radius
  const REACH = 92;     // circle centre distance from the edge at a full pull
  let sum = 0, sy = 0, last = 0, mode = "", theme = null, idle = 0;
  let prev = 0, run = 0, peak = 0;
  // Drawn state follows the target with a spring, so input bursts and the release never jump.
  let shown = 0, vel = 0, target = 0, back = true, leaving = false, raf = 0, broke = false, pop = 0;
  let host = null, svg = null, neck = null, ball = null, icon = null, neckO = null, ballO = null;
  const askTheme = () => { try { ipcRenderer.invoke("lodica-theme").then((t) => { theme = t; }, () => {}); } catch (e) { /* no theme */ } };
  askTheme();
  const canScroll = (el, dx) => {
    for (; el && el !== document.documentElement && el.nodeType === 1; el = el.parentElement) {
      const o = getComputedStyle(el).overflowX;
      if ((o === "auto" || o === "scroll") && el.scrollWidth > el.clientWidth + 1) {
        if (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
      }
    }
    return false;
  };
  const NS = "http://www.w3.org/2000/svg";
  const build = () => {
    host = document.createElement("div");
    host.setAttribute("style", "position:fixed;top:50%;width:140px;height:160px;margin-top:-80px;z-index:2147483647;pointer-events:none;contain:strict;will-change:transform");
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "140"); svg.setAttribute("height", "160"); svg.setAttribute("viewBox", "0 0 140 160");
    svg.style.overflow = "visible";
    // Drawn twice: a thick outline layer under a fill layer, so neck and ball read as one shape with no seam between them.
    neckO = document.createElementNS(NS, "path");
    ballO = document.createElementNS(NS, "g");
    const co = document.createElementNS(NS, "circle");
    co.setAttribute("r", String(R));
    ballO.append(co);
    neck = document.createElementNS(NS, "path");
    ball = document.createElementNS(NS, "g");
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("r", String(R));
    icon = document.createElementNS(NS, "path");
    icon.setAttribute("d", "M7 0H-7M-1 -6l-6 6 6 6");
    icon.setAttribute("fill", "none"); icon.setAttribute("stroke-width", "1.75");
    icon.setAttribute("stroke-linecap", "round"); icon.setAttribute("stroke-linejoin", "round");
    ball.append(c, icon);
    svg.append(neckO, ballO, neck, ball);
    host.append(svg);
  };
  const paint = () => {
    if (!document.documentElement) return;
    if (!host) build();
    const bg = (theme && theme.bg) || "#2B2E33", fg = (theme && theme.amber) || "#F59E0B";
    const t = Math.max(0, Math.min(1.15, shown)), cy = 80;
    const full = !leaving ? Math.abs(sum) >= LIMIT : broke;
    // Snap: past the line the neck breaks and the ball pops a little (spring overshoot); going back re-joins it.
    if (t >= 1 && !broke) { broke = true; pop = 1; } else if (t < .96 && broke && !leaving) broke = false;
    const d = 8 + (REACH - 8) * Math.min(1, t) + (t > 1 ? (t - 1) * 30 : 0);
    const w = broke ? 0 : R * (1.05 - .9 * Math.min(1, t));   // neck half width at its thinnest
    const H = R * 1.9 * (1 - .35 * Math.min(1, t));            // where the neck meets the edge
    const d0 = w <= .5 ? "" :
      "M-2 " + (cy - H) + "C" + (d * .45) + " " + (cy - H) + " " + (d * .45) + " " + (cy - w) + " " + d + " " + (cy - w) +
      "L" + d + " " + (cy + w) + "C" + (d * .45) + " " + (cy + w) + " " + (d * .45) + " " + (cy + H) + " -2 " + (cy + H) + "Z";
    neck.setAttribute("d", d0); neckO.setAttribute("d", d0);
    const s = (.55 + .45 * Math.min(1, t)) * (1 + .12 * pop);
    const tf = "translate(" + d + " " + cy + ") scale(" + s.toFixed(3) + ")";
    ball.setAttribute("transform", tf); ballO.setAttribute("transform", tf);
    ball.firstChild.setAttribute("fill", full ? fg : bg);
    for (const e of [neckO, ballO.firstChild]) { e.setAttribute("fill", fg); e.setAttribute("stroke", fg); e.setAttribute("stroke-width", "3"); }
    neck.setAttribute("fill", bg);
    icon.setAttribute("stroke", full ? bg : fg);
    host.style.left = back ? "0" : "auto";
    host.style.right = back ? "auto" : "0";
    host.style.transform = back ? "" : "scaleX(-1)";
    host.style.opacity = String(Math.min(1, t * 3) * (leaving && broke ? Math.max(0, 1 - (t - 1) * 4) : 1));
    if (!host.isConnected) document.documentElement.appendChild(host);
  };
  // One spring drives everything (stiffness/damping tuned for a soft settle without wobble), so quick repeated input stays smooth.
  const tick = () => {
    raf = 0;
    const k = .22, damp = .62;
    vel = (vel + (target - shown) * k) * damp;
    shown += vel;
    pop *= .82;
    paint();
    const still = Math.abs(target - shown) < .004 && Math.abs(vel) < .004 && pop < .01;
    if (still && leaving) { if (host) host.remove(); leaving = false; broke = false; shown = 0; vel = 0; return; }
    if (!still) raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  const setPull = () => { target = Math.min(1.12, Math.abs(sum) / LIMIT); back = sum < 0; leaving = false; kick(); };
  const reset = () => { clearTimeout(idle); sum = 0; sy = 0; prev = 0; run = 0; peak = 0; mode = ""; };
  // Fingers up: go when the pull is past the line, otherwise the blob slides back into the edge.
  const release = () => {
    if (mode !== "x") { reset(); mode = "done"; return; }
    clearTimeout(idle);
    const go = Math.abs(sum) >= LIMIT, dir = sum < 0 ? "back" : "forward";
    mode = "done";
    leaving = true;
    target = go ? 1.4 : 0;
    kick();
    if (go) ipcRenderer.send("swipe", { dir });
  };
  // Main sees Chromium's scroll end / fling start for the touchpad, which is the real "fingers lifted" on Linux.
  ipcRenderer.on("lodica-swipe-end", () => { if (mode === "x") release(); });
  window.addEventListener("wheel", e => {
    if (e.ctrlKey) return;
    const now = Date.now(), gap = now - last;
    // Line and page units (some Wayland setups) become pixels so the pull distance is comparable everywhere.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerWidth : 1, dx = e.deltaX * unit, dyy = e.deltaY * unit;
    last = now;
    // A finished gesture is over after a short quiet moment (its momentum is ignored). An open one keeps its pull while the fingers rest.
    if (gap > (mode === "done" ? 220 : 1500)) { reset(); askTheme(); }
    ipcRenderer.send("swipe", { dx: Math.round(dx), dy: Math.round(dyy), sum: Math.round(sum), shift: e.shiftKey });
    if (mode === "done" || mode === "y") return;
    const a = Math.abs(dx);
    if (mode === "x" && !dx && !dyy) { release(); return; }
    if (!mode) {
      // The first bit of travel decides: mostly sideways and nothing on the page to scroll that way, or else this is a scroll.
      sum += dx; sy += dyy;
      if (Math.hypot(sum, sy) < START) return;
      if (Math.abs(sum) < Math.abs(sy) * 2 || canScroll(e.target, sum)) { mode = "y"; return; }
      mode = "x";
      sy = 0;
    } else {
      sum += dx; sy += dyy;
    }
    // Momentum after the fingers lift: steps keep shrinking smoothly in the same direction. Eight in a row is a lift.
    run = prev && a <= prev && a >= prev * .93 && Math.sign(dx) === Math.sign(sum) ? run + 1 : 0;
    prev = a; peak = Math.max(peak, a);
    setPull();
    if (run >= 8 && a < peak * .85) { release(); return; }
    // Fallback when no end signal arrives: Linux stops sending events when the fingers lift, other systems send momentum.
    clearTimeout(idle);
    idle = setTimeout(release, process.platform === "linux" ? 260 : 1500);
  }, { capture: true, passive: true });
}
