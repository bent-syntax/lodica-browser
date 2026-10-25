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
