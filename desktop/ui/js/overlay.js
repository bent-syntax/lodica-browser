"use strict";
// Overlay layer stack. First layer switches main to "overlay" layout, last close switches back to "bar".
const STACK = [];
let ovOn = false, mainOverlay = false, barTimer = null;

async function ensureOverlay() {
  clearTimeout(barTimer); barTimer = null;
  if (ovOn) return;
  ovOn = true;
  document.body.classList.add("ov");
  if (!mainOverlay) await inv("layout", "overlay");
}
function maybeBar() {
  if (STACK.length) return;
  clearTimeout(barTimer);
  barTimer = setTimeout(() => {
    barTimer = null;
    if (STACK.length || !ovOn) return;
    ovOn = false; mainOverlay = false;
    document.body.classList.remove("ov");
    moveToastsToBar();
    inv("layout", "bar");
  }, 125);
}
// main opened an overlay itself (its own prompt): render in overlay mode without asking for layout.
function onMainOverlay(d) {
  if (d && d.on) { mainOverlay = true; ovOn = true; clearTimeout(barTimer); document.body.classList.add("ov"); }
  else if (!STACK.length) { mainOverlay = false; ovOn = false; document.body.classList.remove("ov"); moveToastsToBar(); }
}

// opts: {cls, modal, dim (default true), above (keep bar visible), onClose(result), onEsc, key}
function openLayer(opts, build) {
  opts = opts || {};
  if (opts.key) { const old = STACK.find((l) => l.key === opts.key); if (old) old.close(); }
  const L = { key: opts.key, modal: !!opts.modal, onClose: opts.onClose, onEsc: opts.onEsc, closed: false };
  L.el = h("div", { class: "layer" + (opts.cls ? " " + opts.cls : "") + (opts.above ? " above" : "") });
  if (opts.dim !== false) L.el.append(h("div", { class: "dim", act: () => { if (!L.modal) L.close(); } }));
  L.close = (result) => {
    if (L.closed) return; L.closed = true;
    const i = STACK.indexOf(L); if (i >= 0) STACK.splice(i, 1);
    L.el.classList.remove("on"); L.el.classList.add("out");
    setTimeout(() => L.el.remove(), 125);
    try { L.onClose && L.onClose(result); } catch (e) { console.warn(e); }
    maybeBar();
  };
  STACK.push(L);
  const content = build(L);
  if (content) L.el.append(content);
  // Show synchronously in the DOM; the window grows to overlay layout in parallel.
  $("#layers").append(L.el);
  ensureOverlay().then(() => {
    if (L.closed) return;
    requestAnimationFrame(() => requestAnimationFrame(() => L.el.classList.add("on")));
    const f = L.el.querySelector("[autofocus]"); if (f) setTimeout(() => f.focus(), 30);
  });
  return L;
}
const topLayer = () => STACK[STACK.length - 1];
function escTop() {
  const L = topLayer(); if (!L) return false;
  if (L.onEsc) L.onEsc(); else L.close();
  return true;
}
function closeAll(exceptModal) { for (const L of STACK.slice().reverse()) if (!(exceptModal && L.modal)) L.close(); }

// Bottom sheet. opts: {title, cls, head:[nodes], key, onClose, tall, wide, full}. body(el, L) fills content.
function sheet(opts, body) {
  return openLayer({ key: opts.key, onClose: opts.onClose, cls: opts.layerCls }, (L) => {
    const b = h("div", { class: "sh-body" });
    const s = h("div", { class: "sheet" + (opts.tall ? " tall" : "") + (opts.wide ? " wide" : "") + (opts.full ? " full" : "") + (opts.cls ? " " + opts.cls : "") },
      h("div", { class: "grip" }),
      opts.title != null ? h("div", { class: "sh-head" }, h("h2", { text: opts.title }), opts.head || null, ib("close", "Close", () => L.close())) : null,
      b);
    L.body = b; L.sheet = s;
    body(b, L);
    return s;
  });
}

// Toasts and bubbles. With no overlay they cover the bar (only 58px visible); otherwise float above it.
let barToast = null;
function moveToastsToOverlay() {}
function moveToastsToBar() {
  const b = $("#banner"); const ts = $$(".toast", b);
  ts.slice(0, -1).forEach((t) => t._kill && t._kill()); // keep only the newest in the bar slot
}
// opts: {text, icon, actions:[{label, fn, cls}], ms}
function toast(opts) {
  if (typeof opts === "string") opts = { text: opts };
  const b = $("#banner");
  if (!ovOn) $$(".toast", b).forEach((t) => t._kill && t._kill());
  const acts = (opts.actions || []).map((a) => h("button", { class: "act" + (a.cls ? " " + a.cls : ""),
    act: () => { kill(); a.fn && a.fn(); } }, a.label));
  const t = h("div", { class: "toast" + (opts.cls ? " " + opts.cls : ""), role: "status" },
    opts.icon ? ico(opts.icon) : null, h("div", { class: "t", text: opts.text, title: opts.text }), acts);
  let timer = null, gone = false;
  function kill() {
    if (gone) return; gone = true; clearTimeout(timer);
    t.classList.remove("on"); t.classList.add("out");
    setTimeout(() => t.remove(), 125);
    if (barToast === t) barToast = null;
    opts.onGone && opts.onGone();
  }
  t._kill = kill;
  t.addEventListener("mouseenter", () => clearTimeout(timer));
  t.addEventListener("mouseleave", () => { if (!gone) timer = setTimeout(kill, 2500); });
  b.append(t);
  barToast = t;
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("on")));
  const ms = opts.ms != null ? opts.ms : (acts.length ? 6000 : 3000);
  if (ms > 0) timer = setTimeout(kill, ms);
  return { close: kill, el: t };
}
