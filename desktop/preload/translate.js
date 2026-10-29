"use strict";
// Translate the selected text: Dutch into French and French into Dutch, next to the selection (Settings > Translation).
// Its own preload (registered per session in main.js), so it does not depend on the generated preload/content.js and
// runs in every frame. The selection is read with getSelection().toString(), which also works inside shadow DOM, and the
// bubble sits in its own shadow root, so the page's styles cannot reach it.
const { ipcRenderer } = require("electron");
if (/^https?:$/.test(location.protocol)) {
  let timer = 0, host = null, shown = "", seq = 0, px = 0, py = 0;
  // Where the pointer last went up: the anchor when the page gives no usable selection rectangle.
  addEventListener("pointerup", (e) => { px = e.clientX; py = e.clientY; schedule(60); }, true);
  addEventListener("keyup", (e) => { if (e.shiftKey || e.key === "Shift" || e.ctrlKey) schedule(250); }, true);
  document.addEventListener("selectionchange", () => schedule(250));
  addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); }, true);
  addEventListener("pointerdown", (e) => { if (host && e.target !== host) hide(); }, true);
  addEventListener("scroll", () => { if (host) place(read()); }, { capture: true, passive: true });

  function schedule(ms) { clearTimeout(timer); timer = setTimeout(check, ms); }
  function hide() { seq++; shown = ""; if (host) { host.remove(); host = null; } }

  // The selected text and a point above it. Text fields, plain pages and shadow DOM all end up here.
  function read() {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
      try {
        const a = el.selectionStart, b = el.selectionEnd;
        if (a != null && a !== b) { const r = el.getBoundingClientRect(); return { text: el.value.slice(a, b), x: r.left + r.width / 2, y: r.top }; }
      } catch (e) { /* input type without a selection */ }
    }
    const s = getSelection(), text = s ? s.toString() : "";
    if (!text.trim()) return null;
    let x = px, y = py;
    try { const r = s.getRangeAt(0).getBoundingClientRect(); if (r.width || r.height) { x = r.left + r.width / 2; y = r.top; } } catch (e) { /* no range */ }
    return { text, x, y };
  }

  async function check() {
    const s = read();
    if (!s) { hide(); return; }
    const text = s.text.trim();
    if (text === shown) { place(s); return; }
    hide();
    if (text.length < 2 || text.length > 300) return;
    const mine = ++seq;
    let r = null, theme = null;
    try { [r, theme] = await Promise.all([ipcRenderer.invoke("translate-selection", text), ipcRenderer.invoke("lodica-theme")]); } catch (e) { return; }
    const now = read();
    if (mine !== seq || !r || !now || now.text.trim() !== text) return;
    shown = text;
    show(now, r, theme);
  }

  function show(s, r, theme) {
    const bg = (theme && theme.bg) || "#1F2937", fg = (theme && theme.text) || "#E5E7EB", accent = (theme && theme.amber) || "#F59E0B";
    host = document.createElement("div");
    host.setAttribute("style", "all:initial;position:fixed;z-index:2147483647;left:0;top:0;visibility:hidden");
    const root = host.attachShadow({ mode: "closed" });
    const box = document.createElement("div");
    box.setAttribute("style", "display:flex;gap:10px;align-items:flex-start;max-width:min(380px,90vw);box-sizing:border-box;padding:8px 12px;border-radius:12px;" +
      "font:13px/1.4 system-ui,sans-serif;background:" + bg + ";color:" + fg + ";border:1px solid " + accent + ";box-shadow:0 4px 14px rgba(0,0,0,.4)");
    const label = document.createElement("b");
    label.textContent = r.from.toUpperCase() + " → " + r.to.toUpperCase();
    label.setAttribute("style", "color:" + accent + ";font-weight:600;white-space:nowrap");
    const out = document.createElement("span");
    out.textContent = r.out;
    out.setAttribute("style", "flex:1;user-select:text;word-break:break-word");
    const copy = document.createElement("button");
    copy.textContent = "Copy";
    copy.setAttribute("style", "all:initial;cursor:pointer;font:600 12px system-ui,sans-serif;color:" + accent + ";padding:0 2px");
    copy.addEventListener("click", () => {
      let ok = false;
      try { navigator.clipboard.writeText(r.out); ok = true; } catch (e) { /* blocked */ }
      copy.textContent = ok ? "Copied" : "Press Ctrl+C";
    });
    // Clicking in the bubble must not clear the page selection.
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.append(label, out, copy);
    root.append(box);
    (document.documentElement || document.body).appendChild(host);
    place(s);
  }

  // Above the selection, kept inside the window; below it when there is no room above.
  function place(s) {
    if (!host || !s) return;
    const r = host.getBoundingClientRect();
    const x = Math.max(4, Math.min(s.x - r.width / 2, innerWidth - r.width - 4));
    let y = s.y - r.height - 8;
    if (y < 4) y = Math.min(innerHeight - r.height - 4, s.y + 28);
    host.style.left = Math.round(x) + "px";
    host.style.top = Math.round(Math.max(4, y)) + "px";
    host.style.visibility = "visible";
  }
}
