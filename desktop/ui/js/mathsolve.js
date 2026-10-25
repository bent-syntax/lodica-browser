"use strict";
// Math answer for the notebook: same solver as the page selection bubble in preload/content.js (calc and solve). Keep in step.
const mathAnswer = (() => {
  function calc(src) {
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
    if (Math.abs(v) >= 1e15 || (v !== 0 && Math.abs(v) < 1e-9)) return v.toExponential(6).replace(/\.?0+e/, "e");
    return String(Number(v.toPrecision(12)));
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
      const a = calc("(" + side(l, x) + ")-(" + side(r, x) + ")");
      return a == null ? NaN : Number(a);
    };
    const f0 = f(0), f1 = f(1), f2 = f(2), f3 = f(3);
    if (![f0, f1, f2, f3].every(isFinite)) return null;
    const A = (f2 - 2 * f1 + f0) / 2, B = f1 - f0 - A, C = f0;
    const tol = 1e-7 * (1 + Math.abs(f0) + Math.abs(f1) + Math.abs(f2));
    if (Math.abs(A * 9 + B * 3 + C - f3) > tol) return null;
    const fmt = (n) => String(Number(n.toPrecision(10)));
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

// Function graph for the notebook: "y = x^2", "f(x) = sin(x)" or a bare expression in x. Returns a function of x or null. Keep in step with MathSolver.graph in the Android app.
const mathGraph = (() => {
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp, abs: Math.abs, sqrt: Math.sqrt };
  const isFn = (w) => Object.prototype.hasOwnProperty.call(FN, w);
  return (src) => {
    let s = String(src).trim().toLowerCase().replace(/[−–—]/g, "-").replace(/[×·⋅]/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^").replace(/π/g, "pi");
    if (!s || s.length > 120) return null;
    s = s.replace(/^(?:y|f\s*\(\s*x\s*\))\s*=\s*/, "");
    if (!/^[\d\s.+\-*/^()a-z]+$/.test(s)) return null;
    const t = s.match(/\d+\.?\d*|\.\d+|[a-z]+|[+\-*/^()]/g);
    if (!t || t.join("") !== s.replace(/\s+/g, "") || !t.includes("x")) return null;
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
      while (peek() === "+" || peek() === "-") { const o = tk[i++], a = f, b = term(); f = o === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x); }
      return f;
    };
    const term = () => {
      let f = unary();
      while (peek() === "*" || peek() === "/") { const o = tk[i++], a = f, b = unary(); f = o === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x); }
      return f;
    };
    const unary = () => {
      if (peek() === "-") { i++; const a = unary(); return (x) => -a(x); }
      if (peek() === "+") { i++; return unary(); }
      const b = atom();
      if (peek() === "^") { i++; const e = unary(); return (x) => Math.pow(b(x), e(x)); }
      return b;
    };
    const atom = () => {
      const w = tk[i++];
      if (w === undefined) throw 0;
      if (w === "(") { const f = expr(); if (tk[i++] !== ")") throw 0; return f; }
      if (/^[\d.]/.test(w)) { const n = parseFloat(w); return () => n; }
      if (w === "x") return (x) => x;
      if (w === "pi") return () => Math.PI;
      if (w === "e") return () => Math.E;
      if (isFn(w)) { const g = FN[w], a = atom(); return (x) => g(a(x)); }
      throw 0;
    };
    try { const f = expr(); return i === tk.length ? f : null; } catch (e) { return null; }
  };
})();

/** Draws f on canvas [cv] for x in -10..10: axes and the curve, y range fitted to the curve. */
function drawGraph(cv, f) {
  const w = cv.width, hh = cv.height, c = cv.getContext("2d");
  const css = getComputedStyle(cv);
  const muted = css.getPropertyValue("--muted").trim() || "#9CA3AF", amber = css.getPropertyValue("--amber").trim() || "#F59E0B";
  const lo = -10, hi = 10;
  let ymin = Infinity, ymax = -Infinity;
  const ys = [];
  for (let px = 0; px <= w; px++) {
    const y = f(lo + (hi - lo) * px / w);
    ys.push(y);
    if (isFinite(y) && Math.abs(y) < 1e6) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
  }
  if (!isFinite(ymin)) { ymin = -10; ymax = 10; }
  if (ymax - ymin < 1e-6) { ymin -= 1; ymax += 1; }
  const pad = (ymax - ymin) * 0.1;
  ymin = Math.max(ymin - pad, -50); ymax = Math.min(ymax + pad, 50);
  if (ymax <= ymin) { ymin = -10; ymax = 10; }
  const X = (x) => (x - lo) / (hi - lo) * w, Y = (y) => hh - (y - ymin) / (ymax - ymin) * hh;
  c.clearRect(0, 0, w, hh);
  c.lineWidth = 1.8; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = muted;
  c.beginPath();
  if (ymin < 0 && ymax > 0) { c.moveTo(0, Y(0)); c.lineTo(w, Y(0)); }
  c.moveTo(X(0), 0); c.lineTo(X(0), hh);
  c.stroke();
  c.strokeStyle = amber; c.beginPath();
  let pen = false;
  ys.forEach((y, px) => {
    if (!isFinite(y) || y < ymin - (ymax - ymin) || y > ymax + (ymax - ymin)) { pen = false; return; }
    if (pen) c.lineTo(px, Y(y)); else c.moveTo(px, Y(y));
    pen = true;
  });
  c.stroke();
}
