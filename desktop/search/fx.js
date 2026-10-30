"use strict";
// Holiday effects. One canvas over the page; the cursor pushes the particles. Works on the start page and, injected, in every tab.
// Snow and confetti settle on the screen bottom and, on the start page, on the search bar, planner, notes and shortcuts.
(function () {
  if (window.__lodicaFx) { window.__lodicaFx.set(window.__lodicaFxKind || ""); return; }
  const COL = 4, LEDGES = "#fw,#plan,#notes,#top";
  const KINDS = {
    christmas: { n: 140, size: [1.5, 3.5], colors: ["#FFFFFF", "#E8F1FF"], fall: [20, 55], sway: 22, settle: true, shape: "dot" },
    "new-year": { n: 90, size: [3, 6], colors: ["#FFD700", "#FF4D8D", "#7DD3FC", "#86EFAC", "#FFFFFF"], fall: [40, 90], sway: 30, settle: true, shape: "rect" },
    halloween: { n: 36, size: [8, 14], colors: ["#FF7A18", "#9BE564", "#B49BD1"], fall: [-30, -8], sway: 40, settle: false, shape: "bat" },
    "st-patrick": { n: 40, size: [9, 15], colors: ["#4CC96B", "#8EE6A0", "#F5D76E"], fall: [25, 55], sway: 36, settle: false, shape: "clover" },
    "national-day": { n: 90, size: [4, 8], colors: ["#FDDA24", "#111111", "#EF3340"], fall: [35, 80], sway: 28, settle: true, shape: "rect" },
    valentine: { n: 34, size: [8, 16], colors: ["#FF5C8A", "#FF3B5C", "#FFB3C9"], fall: [-45, -15], sway: 24, settle: false, shape: "heart" },
  };
  let kind = "", cv, cx, W = 0, H = 0, raf = 0, last = 0, parts = [], ledges = [], floor = [], mx = -999, my = -999, vx = 0, vy = 0, lt = 0, ledgeTimer = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  function make(cfg, top) {
    const s = rnd(cfg.size[0], cfg.size[1]);
    return { x: rnd(0, W), y: top ? rnd(-H * 0.2, -4) : rnd(0, H), vx: 0, vy: rnd(cfg.fall[0], cfg.fall[1]), s, c: cfg.colors[(Math.random() * cfg.colors.length) | 0], ph: rnd(0, 6.28), rot: rnd(0, 6.28) };
  }
  function size() {
    W = innerWidth; H = innerHeight;
    cv.width = W; cv.height = H;
    floor = new Array(Math.ceil(W / COL)).fill(0);
    ledges.forEach((l) => { l.h = new Array(Math.ceil(l.w / COL)).fill(0); });
  }
  function measure() {
    const next = [];
    if (KINDS[kind] && KINDS[kind].settle) document.querySelectorAll(LEDGES).forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 8 || r.bottom < 0 || r.top > H) return;
      const old = ledges.find((l) => l.e === e);
      const n = { e, x: r.left, y: r.top, w: r.width, h: old && old.h.length === Math.ceil(r.width / COL) ? old.h : new Array(Math.ceil(r.width / COL)).fill(0) };
      next.push(n);
    });
    ledges = next;
  }
  // Snow on a surface is blown off where the cursor moves through it.
  function blow(heights, ox, surfaceY, cfg) {
    const R = 46, speed = Math.hypot(vx, vy);
    for (let i = 0; i < heights.length; i++) {
      if (heights[i] <= 0) continue;
      const x = ox + i * COL;
      if (Math.abs(x - mx) > R || my < surfaceY - heights[i] - R || my > surfaceY + 14) continue;
      const take = Math.min(heights[i], 0.6 + speed * 0.02);
      heights[i] -= take;
      if (Math.random() < 0.5 && parts.length < 600) {
        const p = make(cfg, false);
        p.x = x; p.y = surfaceY - heights[i] - 2; p.vx = vx * 0.5 + rnd(-40, 40); p.vy = Math.min(vy * 0.3, 0) - rnd(20, 90);
        parts.push(p);
      }
    }
  }
  function land(heights, ox, p, cap) {
    const i = Math.max(0, Math.min(heights.length - 1, ((p.x - ox) / COL) | 0));
    heights[i] = Math.min(cap, heights[i] + p.s * 0.35);
    // Spill sideways so the pile slopes instead of becoming a spike.
    for (const j of [i - 1, i + 1]) if (heights[j] != null && heights[i] - heights[j] > 3) { heights[j] += 0.5; heights[i] -= 0.5; }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    const cfg = KINDS[kind]; if (!cfg) return;
    const k = Math.exp(-dt * 6);
    vx *= k; vy *= k;
    cx.clearRect(0, 0, W, H);
    const R = 90;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const dx = p.x - mx, dy = p.y - my, d = Math.hypot(dx, dy);
      if (d < R) {
        const f = (1 - d / R);
        p.vx += (dx / (d || 1)) * f * 380 * dt + vx * f * 0.35;
        p.vy += (dy / (d || 1)) * f * 380 * dt + vy * f * 0.35;
      }
      p.ph += dt * 1.6; p.rot += dt * (p.vx * 0.02 + 1);
      p.vx *= Math.exp(-dt * 1.4);
      const rest = (p.vy - rnd(cfg.fall[0], cfg.fall[1]));
      if (Math.abs(rest) > 1) p.vy -= rest * Math.min(1, dt * 0.8);
      const px = p.x, py = p.y;
      p.x += (p.vx + Math.sin(p.ph) * cfg.sway) * dt; p.y += p.vy * dt;
      if (cfg.settle && p.vy > 0) {
        let done = false;
        for (const l of ledges) {
          if (p.x < l.x || p.x > l.x + l.w) continue;
          const hh = l.h[Math.max(0, Math.min(l.h.length - 1, ((p.x - l.x) / COL) | 0))];
          if (py <= l.y - hh && p.y >= l.y - hh) { land(l.h, l.x, p, 18); done = true; break; }
        }
        if (!done) {
          const fi = Math.max(0, Math.min(floor.length - 1, (p.x / COL) | 0));
          if (p.y >= H - floor[fi]) { land(floor, 0, p, Math.min(90, H * 0.12)); done = true; }
        }
        if (done) { parts[i] = make(cfg, true); continue; }
      }
      if (p.y > H + 20 || p.y < -40 || p.x < -40 || p.x > W + 40) { parts[i] = make(cfg, true); if (cfg.fall[1] < 0) parts[i].y = H + rnd(0, 40); continue; }
      draw(p, cfg);
    }
    if (cfg.settle) {
      cx.fillStyle = cfg.colors[0];
      cx.globalAlpha = 0.92;
      blow(floor, 0, H, cfg);
      for (let i = 0; i < floor.length; i++) if (floor[i] > 0.3) cx.fillRect(i * COL, H - floor[i], COL, floor[i]);
      for (const l of ledges) {
        blow(l.h, l.x, l.y, cfg);
        for (let i = 0; i < l.h.length; i++) if (l.h[i] > 0.3) cx.fillRect(l.x + i * COL, l.y - l.h[i], COL, l.h[i]);
      }
      cx.globalAlpha = 1;
    }
  }
  function draw(p, cfg) {
    cx.fillStyle = p.c;
    if (cfg.shape === "dot") { cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, 6.283); cx.fill(); return; }
    cx.save(); cx.translate(p.x, p.y); cx.rotate(cfg.shape === "rect" ? p.rot : Math.sin(p.ph) * 0.3);
    if (cfg.shape === "rect") cx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6);
    else if (cfg.shape === "clover") {
      const s = p.s / 2.2; cx.globalAlpha = 0.9;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { cx.beginPath(); cx.arc(ox * s * 0.6, oy * s * 0.6, s * 0.65, 0, 6.283); cx.fill(); }
      cx.fillRect(-s * 0.1, s * 0.6, s * 0.2, s * 1.2); cx.globalAlpha = 1;
    } else if (cfg.shape === "heart") {
      const s = p.s / 2; cx.globalAlpha = 0.85; cx.beginPath();
      cx.moveTo(0, s * 0.6); cx.bezierCurveTo(-s * 1.4, -s * 0.3, -s * 0.6, -s * 1.3, 0, -s * 0.5); cx.bezierCurveTo(s * 0.6, -s * 1.3, s * 1.4, -s * 0.3, 0, s * 0.6); cx.fill(); cx.globalAlpha = 1;
    } else {
      const s = p.s, flap = Math.sin(p.ph * 4) * 0.5; cx.globalAlpha = 0.9; cx.beginPath();
      cx.moveTo(0, 0); cx.quadraticCurveTo(-s * 0.6, -s * (0.9 + flap), -s, -s * 0.1); cx.quadraticCurveTo(-s * 0.5, -s * 0.1, -s * 0.3, s * 0.3);
      cx.lineTo(0, s * 0.1); cx.lineTo(s * 0.3, s * 0.3); cx.quadraticCurveTo(s * 0.5, -s * 0.1, s, -s * 0.1); cx.quadraticCurveTo(s * 0.6, -s * (0.9 + flap), 0, 0); cx.fill(); cx.globalAlpha = 1;
    }
    cx.restore();
  }

  function stop() {
    cancelAnimationFrame(raf); raf = 0; clearInterval(ledgeTimer);
    if (cv) cv.remove(); cv = null; parts = []; ledges = [];
  }
  function set(k) {
    k = KINDS[k] && !reduce.matches ? k : "";
    if (k === kind && (k ? raf : true)) return;
    stop(); kind = k;
    if (!k) return;
    cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646";
    (document.body || document.documentElement).appendChild(cv);
    cx = cv.getContext("2d");
    size();
    parts = Array.from({ length: KINDS[k].n }, () => make(KINDS[k], false));
    measure(); ledgeTimer = setInterval(measure, 500);
    last = performance.now(); raf = requestAnimationFrame(frame);
  }
  addEventListener("mousemove", (e) => {
    const n = performance.now(), dt = Math.max(8, n - lt) / 1000; lt = n;
    vx = Math.max(-900, Math.min(900, (e.clientX - mx) / dt)); vy = Math.max(-900, Math.min(900, (e.clientY - my) / dt));
    if (mx === -999) { vx = 0; vy = 0; }
    mx = e.clientX; my = e.clientY;
  }, { passive: true });
  addEventListener("mouseleave", () => { mx = my = -999; });
  addEventListener("resize", () => { if (cv) { size(); measure(); } });
  window.__lodicaFx = { set };
  set(window.__lodicaFxKind || "");
})();
