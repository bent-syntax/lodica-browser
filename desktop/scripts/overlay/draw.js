
// Draw mode (Ctrl+Shift+D) and move mode (Ctrl+Shift+M). Strokes live in an SVG laid over the page, so they scroll with it.
// Moves are saved as a CSS selector plus an offset. Both are stored per page address by the main process.
if (window === window.top && /^https?:$/.test(location.protocol)) (() => {
  const NS = "http://www.w3.org/2000/svg";
  const pageKey = () => location.origin + location.pathname + location.search;
  let key = pageKey(), data = { strokes: [], moves: [] };
  let mode = "", tool = "pen", color = "#F59E0B", size = 4, bar = null, svg = null, host = null;

  const save = () => ipcRenderer.send("drawSave", key, data);
  const docSize = () => [Math.max(document.documentElement.scrollWidth, innerWidth), Math.max(document.documentElement.scrollHeight, innerHeight)];

  function ensureSvg() {
    if (svg && svg.isConnected) return;
    svg = document.createElementNS(NS, "svg");
    svg.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:2147483646;overflow:visible";
    document.documentElement.appendChild(svg);
    fit();
  }
  function fit() {
    if (!svg) return;
    const [w, h] = docSize();
    svg.setAttribute("width", w); svg.setAttribute("height", h);
  }
  const pathD = p => p.length === 1 ? `M${p[0][0]} ${p[0][1]}l0.1 0` : "M" + p.map(q => q[0] + " " + q[1]).join("L");
  function addPath(s) {
    const el = document.createElementNS(NS, "path");
    el.setAttribute("d", pathD(s.p));
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", s.c);
    el.setAttribute("stroke-width", s.w);
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    if (s.h) el.setAttribute("stroke-opacity", "0.4");
    svg.appendChild(el);
    return el;
  }
  function render() {
    if (!data.strokes.length && !svg) return;
    ensureSvg();
    svg.replaceChildren();
    for (const s of data.strokes) addPath(s);
  }

  const cssPath = el => {
    const parts = [];
    while (el && el !== document.documentElement) {
      if (el.id && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) { parts.unshift("#" + CSS.escape(el.id)); break; }
      const p = el.parentElement;
      if (!p) break;
      parts.unshift(el.tagName.toLowerCase() + ":nth-child(" + (Array.prototype.indexOf.call(p.children, el) + 1) + ")");
      el = p;
    }
    return parts.join(">");
  };
  const shift = (el, dx, dy) => { if (dx || dy) el.style.setProperty("translate", dx + "px " + dy + "px", "important"); else el.style.removeProperty("translate"); };
  let applyTimer = 0;
  function applyMoves(tries = 0) {
    clearTimeout(applyTimer);
    let missing = false;
    for (const m of data.moves) {
      let el = null;
      try { el = document.querySelector(m.s); } catch { /* bad selector */ }
      if (el) shift(el, m.x, m.y); else missing = true;
    }
    // Pages that build their content late: keep looking for a few seconds.
    if (missing && tries < 20) applyTimer = setTimeout(() => applyMoves(tries + 1), 500);
  }
  function load() {
    key = pageKey();
    data = ipcRenderer.sendSync("drawLoad", key) || { strokes: [], moves: [] };
    render(); applyMoves();
  }

  function eraseAll() {
    for (const m of data.moves) { try { const el = document.querySelector(m.s); if (el) shift(el, 0, 0); } catch { /* ignore */ } }
    data = { strokes: [], moves: [] };
    render(); save();
  }

  function buildBar() {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;justify-content:center;pointer-events:none";
    const r = host.attachShadow({ mode: "closed" });
    r.innerHTML = `<style>
      .b{pointer-events:auto;display:flex;align-items:center;gap:8px;margin:8px;padding:8px 12px;background:#2B2E33;color:#ECEDEE;border:1px solid #33363C;border-radius:12px;font:13px system-ui,sans-serif;box-shadow:0 12px 32px #00000073}
      button{all:unset;cursor:pointer;padding:4px 12px;border-radius:999px;background:#33363C;color:#ECEDEE;font:13px system-ui,sans-serif}
      button.on{background:#F59E0B;color:#1A1300}button.x{background:#F87185;color:#fff}
      input[type=color]{width:28px;height:28px;border:0;padding:0;background:none;cursor:pointer}
      input[type=range]{width:80px;accent-color:#F59E0B}.m{color:#A0A4AB}
    </style><div class="b"></div>`;
    document.documentElement.appendChild(host);
    return r.querySelector(".b");
  }
  function drawBar() {
    if (!bar) bar = buildBar();
    if (mode === "move") {
      bar.innerHTML = `<span class="m">Move: drag any spot on the page. Esc to finish.</span><button data-a="erase" class="x">Erase from tab</button><button data-a="done">Done</button>`;
    } else {
      const t = (id, l) => `<button data-t="${id}" class="${tool === id ? "on" : ""}">${l}</button>`;
      bar.innerHTML = t("pen", "Pen") + t("hl", "Highlighter") + t("eraser", "Eraser") +
        `<input type="color" value="${color}" data-c><input type="range" min="1" max="24" value="${size}" data-s>` +
        `<button data-a="undo">Undo</button><button data-a="erase" class="x">Erase from tab</button><button data-a="done">Done</button>`;
    }
  }
  function setMode(m) {
    mode = mode === m ? "" : m;
    if (!mode) { if (host) host.remove(); host = bar = null; document.documentElement.style.cursor = ""; return; }
    if (!host) { host = null; bar = null; }
    if (!bar) bar = buildBar();
    drawBar();
    document.documentElement.style.cursor = mode === "move" ? "move" : "crosshair";
    ensureSvg();
  }

  // The main process catches Ctrl+Shift+D/M even when the page does not own focus.
  ipcRenderer.on("drawToggle", (e, m) => { if (m === "draw" || m === "move") { if (mode && mode !== m) mode = ""; setMode(m); } });
  const onBar = e => e.composedPath().includes(host);
  let cur = null, dragEl = null, start = null, hover = null;

  document.addEventListener("click", e => {
    if (!bar || !host || !e.composedPath().includes(host)) return;
    const b = e.composedPath().find(n => n.dataset && (n.dataset.a || n.dataset.t));
    if (!b) return;
    if (b.dataset.t) { tool = b.dataset.t; drawBar(); }
    else if (b.dataset.a === "undo") { data.strokes.pop(); render(); save(); }
    else if (b.dataset.a === "erase") eraseAll();
    else if (b.dataset.a === "done") setMode(mode);
  }, true);
  document.addEventListener("input", e => {
    const t = e.composedPath()[0];
    if (!host || !t || !t.dataset) return;
    if ("c" in t.dataset) color = t.value;
    if ("s" in t.dataset) size = +t.value;
  }, true);

  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  addEventListener("pointerdown", e => {
    if (!mode || e.button !== 0 || onBar(e)) return;
    stop(e);
    const x = e.pageX, y = e.pageY;
    if (mode === "draw") {
      if (tool === "eraser") { cur = { erase: true }; return; }
      cur = { c: color, w: tool === "hl" ? size * 4 : size, p: [[x, y]], h: tool === "hl" };
      cur.el = addPath(cur);
    } else {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === document.documentElement || el === document.body || el === host) return;
      let s = ""; try { s = cssPath(el); } catch { return; }
      dragEl = { el, s, x, y, m: data.moves.find(m => m.s === s) || { s, x: 0, y: 0 } };
    }
  }, true);
  addEventListener("pointermove", e => {
    if (mode === "move" && !dragEl && !onBar(e)) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (hover && hover !== el) hover.style.removeProperty("outline");
      hover = el && el !== document.documentElement && el !== host ? el : null;
      if (hover) hover.style.setProperty("outline", "2px dashed #F59E0B", "important");
    }
    if (cur && !cur.erase) {
      cur.p.push([e.pageX, e.pageY]);
      cur.el.setAttribute("d", pathD(cur.p));
    } else if (cur && cur.erase) {
      const n = data.strokes.length;
      data.strokes = data.strokes.filter(s => !s.p.some(q => Math.hypot(q[0] - e.pageX, q[1] - e.pageY) < 10 + s.w / 2));
      if (data.strokes.length !== n) render();
    } else if (dragEl) {
      stop(e);
      shift(dragEl.el, dragEl.m.x + e.pageX - dragEl.x, dragEl.m.y + e.pageY - dragEl.y);
    }
  }, true);
  addEventListener("pointerup", e => {
    if (cur && !cur.erase) { data.strokes.push({ c: cur.c, w: cur.w, p: cur.p, ...(cur.h ? { h: 1 } : {}) }); cur.el.remove(); render(); save(); }
    else if (cur) save();
    else if (dragEl) {
      const m = dragEl.m;
      m.x += e.pageX - dragEl.x; m.y += e.pageY - dragEl.y;
      if (!data.moves.includes(m)) data.moves.push(m);
      data.moves = data.moves.filter(v => v.x || v.y);
      save();
    }
    cur = dragEl = null;
  }, true);
  // A click ends a drag in move mode; the page must not also follow a link.
  addEventListener("click", e => { if (mode && !onBar(e)) stop(e); }, true);

  addEventListener("keydown", e => {
    if (e.key === "Escape" && mode) { stop(e); setMode(mode); return; }
  }, true);

  addEventListener("resize", fit);
  addEventListener("load", () => { fit(); applyMoves(); });
  // Single-page sites change the address without a reload: switch to that address's drawings.
  setInterval(() => { if (pageKey() !== key) load(); else if (svg) fit(); }, 1000);
  load();
})();
