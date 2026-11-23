
// QR hover decode: report the element under the cursor so main can crop and decode it locally.
// Top-frame http(s) pages only; this script never reads image bytes, uploads or fetches anything.
if (typeof ipcRenderer !== "undefined" && window === window.top && /^https?:$/.test(location.protocol)) (() => {
  const SEL = "img,canvas,svg,[data-qr]";
  const MIN = 24, MAX = 2048, THROTTLE = 120;
  let sentAt = -Infinity, lastKey = "", cleared = true;

  function targetOf(e) {
    const path = e.composedPath ? e.composedPath() : [];
    for (const n of path) if (n && n.nodeType === 1 && n.matches && n.matches(SEL)) return n;
    let n = e.target;
    while (n && n.nodeType === 1) {
      if (n.matches && n.matches(SEL)) return n;
      n = n.parentElement;
    }
    return null;
  }
  function clear() {
    if (cleared) return;
    cleared = true; lastKey = ""; sentAt = -Infinity;
    ipcRenderer.send("qrHover", { clear: true });
  }
  function onMove(e) {
    const el = targetOf(e);
    if (!el || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) { clear(); return; }
    const r = el.getBoundingClientRect && el.getBoundingClientRect();
    if (!r || !(r.width >= MIN) || !(r.height >= MIN) || r.width > MAX || r.height > MAX) { clear(); return; }
    if (typeof getComputedStyle === "function") {
      const cs = getComputedStyle(el);
      if (!cs || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) { clear(); return; }
    }
    // capturePage takes document coordinates; the cursor stays in viewport coordinates for the tooltip.
    const x = Math.round(r.left + (typeof scrollX === "number" ? scrollX : 0));
    const y = Math.round(r.top + (typeof scrollY === "number" ? scrollY : 0));
    const width = Math.round(r.width), height = Math.round(r.height);
    const tag = el.hasAttribute && el.hasAttribute("data-qr") ? "qr" : (el.tagName ? String(el.tagName).toLowerCase() : "qr");
    const src = el.currentSrc || el.src || (el.getAttribute && el.getAttribute("href")) || "";
    const key = [tag, x, y, width, height, Math.round(e.clientX / 4), Math.round(e.clientY / 4), String(src).slice(0, 200)].join("|");
    const at = Date.now();
    if (key === lastKey || at - sentAt < THROTTLE) return;
    cleared = false; sentAt = at; lastKey = key;
    ipcRenderer.send("qrHover", { x, y, width, height, tag, cx: e.clientX, cy: e.clientY });
  }
  document.addEventListener("pointermove", onMove, true);
  document.addEventListener("pointerleave", clear, true);
  addEventListener("blur", clear);
})();
