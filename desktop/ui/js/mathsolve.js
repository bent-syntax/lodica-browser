"use strict";
/** A number as text: a fraction ("1/2", "-7/3") when it is one with a denominator up to 1000, else rounded to [prec] digits. */
function mathFrac(n, prec) {
  const dec = String(Number(n.toPrecision(prec || 12)));
  if (!isFinite(n) || Number.isInteger(Number(dec)) || Math.abs(n) >= 1e9) return dec;
  const x = Math.abs(n);
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, y = x;
  for (let i = 0; i < 24; i++) {
    const a = Math.floor(y);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > 1000) return dec;
    if (Math.abs(x - h1 / k1) < 1e-9 * Math.max(1, x)) return k1 === 1 ? dec : (n < 0 ? "-" : "") + h1 + "/" + k1;
    const f = y - a;
    if (f < 1e-12) break;
    y = 1 / f;
  }
  return dec;
}

// Math answer for the notebook: same solver as the page selection bubble in preload/content.js (calc and solve). Keep in step.
const mathAnswer = (() => {
  function calc(src, raw) {
    let s = String(src).trim().replace(/\s*=\s*\??\s*$/, "");
    if (!s || s.length > 200 || !/\d/.test(s)) return null;
    s = s.replace(/[×·⋅]/g, "*").replace(/÷/g, "/").replace(/[−–—]/g, "-").replace(/ /g, " ");
    s = s.replace(/(?<=[\d)])\s*x\s*(?=[\d(])/gi, "*").replace(/\*\*/g, "^");
    if (!/^[\d\s.,+\-*/^%()a-z]+$/i.test(s)) return null;
    if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(s) || /^\+?[\d\s()-]{7,}$/.test(s) && !/[+*/^%]/.test(s)) return null;
    if (!/[+\-*/^%]|sqrt|pi/i.test(s)) return null;
    if (/^-?[\d.,]+(?:\s*-\s*[\d.,]+)$/.test(s) && !/\s/.test(s)) return null;
    // 1,234.5 and 1.234,5 both read as one number; a lone comma is a decimal comma
    s = s.replace(/\d[\d.,]*/g, (n) => {
      const c = n.lastIndexOf(","), d = n.lastIndexOf(".");
      if (c < 0) return n;
      if (d >= 0) return c > d ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
      return /^\d{1,3}(,\d{3})+$/.test(n) ? n.replace(/,/g, "") : n.replace(",", ".");
    });
    const t = s.match(/\d+\.?\d*|\.\d+|sqrt|pi|[+\-*/^%()]|\s+/gi);
    if (!t || t.join("") !== s) return null;
    const tk = t.filter((x) => !/^\s+$/.test(x));
    let i = 0, ops = 0;
    const peek = () => tk[i];
    function expr() {
      let v = term();
      while (peek() === "+" || peek() === "-") { const o = tk[i++]; const r = term(); v = o === "+" ? v + r : v - r; ops++; }
      return v;
    }
    function term() {
      let v = unary();
      while (peek() === "*" || peek() === "/") { const o = tk[i++]; const r = unary(); v = o === "*" ? v * r : v / r; ops++; }
      return v;
    }
    function unary() {
      if (peek() === "-") { i++; return -unary(); }
      if (peek() === "+") { i++; return unary(); }
      return power();
    }
    function power() {
      const b = post();
      if (peek() === "^") { i++; const e = unary(); ops++; return Math.pow(b, e); }
      return b;
    }
    function post() {
      let v = atom();
      while (peek() === "%") { i++; v = v / 100; ops++; }
      return v;
    }
    function atom() {
      const x = tk[i++];
      if (x === undefined) throw 0;
      if (x === "(") { const v = expr(); if (tk[i++] !== ")") throw 0; return v; }
      if (/^sqrt$/i.test(x)) { ops++; const v = atom(); return Math.sqrt(v); }
      if (/^pi$/i.test(x)) return Math.PI;
      if (/^[\d.]/.test(x)) return parseFloat(x);
      throw 0;
    }
    let v;
    try { v = expr(); if (i !== tk.length) return null; } catch (e) { return null; }
    if (!ops || typeof v !== "number" || !isFinite(v)) return null;
    if (raw) return v;
    if (Math.abs(v) >= 1e15 || (v !== 0 && Math.abs(v) < 1e-9)) return v.toExponential(6).replace(/\.?0+e/, "e");
    return mathFrac(v, 12);
  }

  // "3x - 24 = -6" -> "x = 6"; one letter unknown, degree 1 or 2
  function solve(src) {
    let s = String(src).trim().replace(/[−–—]/g, "-").replace(/[×·⋅]/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^");
    if (s.length > 120 || (s.match(/=/g) || []).length !== 1) return null;
    const [l, r] = s.split("=");
    if (!l.trim() || !r.trim()) return null;
    const vars = new Set((s.replace(/sqrt|pi/gi, "").match(/[a-z]/gi) || []).map((c) => c.toLowerCase()));
    if (vars.size !== 1) return null;
    const v = [...vars][0];
    if (!/^[\d\s.,+\-*/^%()a-z=]+$/i.test(s) || !/\d/.test(s)) return null;
    const side = (t, x) => t.replace(/sqrt|pi/gi, (m) => "\0" + m.toLowerCase() + "\0")
      .replace(new RegExp(v, "gi"), "\u0001")
      .replace(/(?<=[\d)])\s*(?=\u0001)/g, "*").replace(/(?<=\u0001)\s*(?=[\d(])/g, "*").replace(/\u0001\s*(?=\u0001)/g, "\u0001*")
      .replace(/\u0001/g, "(" + x + ")").replace(/\0/g, "").replace(/(?<=[\d)])\s*(?=\()/g, "*");
    const f = (x) => {
      const a = calc("(" + side(l, x) + ")-(" + side(r, x) + ")", true);
      return a == null ? NaN : a;
    };
    const f0 = f(0), f1 = f(1), f2 = f(2), f3 = f(3);
    if (![f0, f1, f2, f3].every(isFinite)) return null;
    const A = (f2 - 2 * f1 + f0) / 2, B = f1 - f0 - A, C = f0;
    const tol = 1e-7 * (1 + Math.abs(f0) + Math.abs(f1) + Math.abs(f2));
    if (Math.abs(A * 9 + B * 3 + C - f3) > tol) return null;
    const fmt = (n) => mathFrac(n, 10);
    const eps = 1e-9;
    if (Math.abs(A) < eps) {
      if (Math.abs(B) < eps) return null;
      return v + " = " + fmt(-C / B);
    }
    const D = B * B - 4 * A * C;
    if (D < -eps) return null;
    if (Math.abs(D) <= eps) return v + " = " + fmt(-B / (2 * A));
    const q = Math.sqrt(D), x1 = (-B - q) / (2 * A), x2 = (-B + q) / (2 * A);
    const [p, o] = x1 < x2 ? [x1, x2] : [x2, x1];
    return v + " = " + fmt(p) + " or " + fmt(o);
  }

  return (text) => solve(text) || calc(text);
})();

// Function graph for the notebook: "y = x^2", "f(x) = sin(x)", "4y = 3x + 6" (linear in y) or a bare expression in x. Returns a function of x or null. Keep in step with MathSolver.graph in the Android app.
const mathGraph = (() => {
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp, abs: Math.abs, sqrt: Math.sqrt };
  const isFn = (w) => Object.prototype.hasOwnProperty.call(FN, w);
  /** One side of an equation as a function of (x, y); [used] collects the variables met. */
  const parse = (s, used) => {
    if (!/^[\d\s.+\-*/^()a-z]+$/.test(s)) return null;
    const t = s.match(/\d+\.?\d*|\.\d+|[a-z]+|[+\-*/^()]/g);
    if (!t || t.join("") !== s.replace(/\s+/g, "")) return null;
    // 2x, 2(x+1), x(x+1) and )( read as a product
    const tk = [];
    for (const x of t) {
      const p = tk[tk.length - 1];
      if (p !== undefined && /^[\d.]|^[a-z]+$|^\)$/.test(p) && !isFn(p) && /^[\d.]|^[a-z]+$|^\($/.test(x)) tk.push("*");
      tk.push(x);
    }
    let i = 0;
    const peek = () => tk[i];
    const expr = () => {
      let f = term();
      while (peek() === "+" || peek() === "-") { const o = tk[i++], a = f, b = term(); f = o === "+" ? (x, y) => a(x, y) + b(x, y) : (x, y) => a(x, y) - b(x, y); }
      return f;
    };
    const term = () => {
      let f = unary();
      while (peek() === "*" || peek() === "/") { const o = tk[i++], a = f, b = unary(); f = o === "*" ? (x, y) => a(x, y) * b(x, y) : (x, y) => a(x, y) / b(x, y); }
      return f;
    };
    const unary = () => {
      if (peek() === "-") { i++; const a = unary(); return (x, y) => -a(x, y); }
      if (peek() === "+") { i++; return unary(); }
      const b = atom();
      if (peek() === "^") { i++; const e = unary(); return (x, y) => Math.pow(b(x, y), e(x, y)); }
      return b;
    };
    const atom = () => {
      const w = tk[i++];
      if (w === undefined) throw 0;
      if (w === "(") { const f = expr(); if (tk[i++] !== ")") throw 0; return f; }
      if (/^[\d.]/.test(w)) { const n = parseFloat(w); return () => n; }
      if (w === "x") { used.add("x"); return (x) => x; }
      if (w === "y") { used.add("y"); return (x, y) => y; }
      if (w === "pi") return () => Math.PI;
      if (w === "e") return () => Math.E;
      if (isFn(w)) { const g = FN[w], a = atom(); return (x, y) => g(a(x, y)); }
      throw 0;
    };
    try { const f = expr(); return i === tk.length ? f : null; } catch (e) { return null; }
  };
  return (src) => {
    let s = String(src).trim().toLowerCase().replace(/[−–—]/g, "-").replace(/[×·⋅]/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^").replace(/π/g, "pi");
    if (!s || s.length > 120) return null;
    s = s.replace(/^f\s*\(\s*x\s*\)\s*=/, "y=");
    const parts = s.split("=");
    if (parts.length > 2) return null;
    const used = new Set();
    // a bare expression in x is read as y = expression
    const L = parse(parts.length === 2 ? parts[0] : "y", used), R = parse(parts.length === 2 ? parts[1] : s, used);
    if (!L || !R || !used.has("x") || !used.has("y")) return null;
    const g = (x, y) => L(x, y) - R(x, y);
    // solve for y: only equations linear in y, like 4y = 3x + 6, can be drawn as a function of x
    const x0 = 1.3, g0 = g(x0, 0), g1 = g(x0, 1), g2 = g(x0, 2);
    if (!isFinite(g0 + g1 + g2) || Math.abs(g2 - 2 * g1 + g0) > 1e-9 * (1 + Math.abs(g0) + Math.abs(g1) + Math.abs(g2))) return null;
    return (x) => { const a = g(x, 0), b = g(x, 1) - a; return -a / b; };
  };
})();

/** x values where f crosses y = 0, found on -100..100 (a few at most; more means a wave, which has no useful zoom). */
function graphRoots(f) {
  const out = [], N = 2000, A = -100, B = 100;
  let x0 = A, a = f(A);
  for (let i = 1; i <= N; i++) {
    const x1 = A + (B - A) * i / N, b = f(x1);
    if (isFinite(a) && isFinite(b) && (a === 0 || a * b < 0)) {
      let l = x0, r = x1, fl = a;
      for (let k = 0; k < 50 && a !== 0; k++) { const m = (l + r) / 2, fm = f(m); if (fl * fm <= 0) r = m; else { l = m; fl = fm; } }
      const x = a === 0 ? x0 : (l + r) / 2;
      // a jump over zero (tan, 1/x) is not a crossing
      if (Math.abs(f(x)) < 1e-6 * (1 + Math.abs(a) + Math.abs(b)) && !out.some((o) => Math.abs(o - x) < 1e-6)) out.push(x);
    }
    x0 = x1; a = b;
  }
  return out;
}

const GRAPH_COLORS = ["#F59E0B", "#38BDF8", "#34D399", "#F43F5E", "#A78BFA"];

/** Draws f (or a list of functions, all on one graph) on canvas [cv]: axes, the curves and the points where they cross the axes. Zoomed so the x-intercept and the y-intercept both show, with their labels apart. With exactly two functions the points where they meet are marked instead. Keep in step with the Graph composable in the Android app. */
function drawGraph(cv, fl) {
  const fs = (Array.isArray(fl) ? fl : [fl]).slice(0, GRAPH_COLORS.length), multi = fs.length > 1, f = fs[0];
  const w = cv.width, hh = cv.height, c = cv.getContext("2d");
  const css = getComputedStyle(cv);
  const muted = css.getPropertyValue("--muted").trim() || "#9CA3AF", amber = css.getPropertyValue("--amber").trim() || "#F59E0B";
  const roots = graphRoots(f), y0 = f(0);
  const few = (a) => (a.length <= 4 ? a : []);
  const marks = multi ? [] : few(roots);
  const meet = fs.length === 2 ? few(graphRoots((x) => fs[0](x) - fs[1](x))) : [];
  const at0 = isFinite(y0) && Math.abs(y0) < 1e9;
  const near = [0].concat(marks, meet, multi ? fs.flatMap((g) => few(graphRoots(g))) : []);
  let lo = Math.min(...near), hi = Math.max(...near);
  if (hi - lo < 1e-6) { lo = -10; hi = 10; } else { const g = (hi - lo) * 0.4; lo -= g; hi += g; }
  let ymin = Infinity, ymax = -Infinity;
  const yl = fs.map(() => []);
  for (let px = 0; px <= w; px++) {
    fs.forEach((g, k) => {
      const y = g(lo + (hi - lo) * px / w);
      yl[k].push(y);
      if (isFinite(y) && Math.abs(y) < 1e6) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    });
  }
  if (!isFinite(ymin)) { ymin = -10; ymax = 10; }
  if (ymax - ymin < 1e-6) { ymin -= 1; ymax += 1; }
  const pad = (ymax - ymin) * 0.1;
  ymin = Math.max(ymin - pad, -50); ymax = Math.min(ymax + pad, 50);
  if (ymax <= ymin) { ymin = -10; ymax = 10; }
  if (marks.length && at0) {
    // both intercepts stay in view, however far the y-intercept is
    const a = Math.min(0, y0), b = Math.max(0, y0), g = (b - a || 1) * 0.2;
    ymin = Math.min(ymin, a - g); ymax = Math.max(ymax, b + g);
  }
  const X = (x) => (x - lo) / (hi - lo) * w, Y = (y) => hh - (y - ymin) / (ymax - ymin) * hh;
  c.clearRect(0, 0, w, hh);
  c.lineWidth = 1.8; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = muted;
  c.beginPath();
  if (ymin < 0 && ymax > 0) { c.moveTo(0, Y(0)); c.lineTo(w, Y(0)); }
  c.moveTo(X(0), 0); c.lineTo(X(0), hh);
  c.stroke();
  yl.forEach((ys, k) => {
    c.strokeStyle = multi ? GRAPH_COLORS[k] : amber; c.beginPath();
    let pen = false;
    ys.forEach((y, px) => {
      if (!isFinite(y) || y < ymin - (ymax - ymin) || y > ymax + (ymax - ymin)) { pen = false; return; }
      if (pen) c.lineTo(px, Y(y)); else c.moveTo(px, Y(y));
      pen = true;
    });
    c.stroke();
  });
  // intercept points with labels; a label that would overlap an earlier one moves up (or down at the top edge)
  const pts = marks.map((x) => ({ x, y: 0 })).concat(meet.map((x) => ({ x, y: fs[0](x), meet: true })));
  if (!multi && at0 && y0 >= ymin && y0 <= ymax && !pts.some((p) => Math.abs(p.x) < (hi - lo) * 0.01 && Math.abs(y0) < (ymax - ymin) * 0.01)) pts.push({ x: 0, y: y0 });
  c.font = "12px sans-serif"; c.textBaseline = "alphabetic";
  const boxes = [];
  for (const p of pts) {
    const px = X(p.x), py = Y(p.y);
    c.fillStyle = amber; c.beginPath(); c.arc(px, py, 3, 0, Math.PI * 2); c.fill();
    const text = "(" + mathFrac(p.x, 6) + ", " + mathFrac(p.y, 6) + ")", tw = c.measureText(text).width;
    // on the x axis the label sits under the point, on the y axis it sits right of it
    const low = p.y === 0 && !p.meet;
    let bx = low ? px - tw / 2 : px + 8, by = low ? py + 18 : py - 8;
    if (!low && bx + tw > w - 2) bx = px - 8 - tw;
    bx = Math.max(2, Math.min(bx, w - tw - 2));
    const hit = () => boxes.some((r) => bx < r.x + r.w + 4 && bx + tw + 4 > r.x && by - 12 < r.y + 2 && by + 2 > r.y - 12);
    for (let k = 0; k < 4 && hit(); k++) by += by - 12 > 14 ? -14 : 14;
    by = Math.max(12, Math.min(by, hh - 4));
    boxes.push({ x: bx, y: by, w: tw });
    c.fillStyle = muted; c.fillText(text, bx, by);
  }
}
