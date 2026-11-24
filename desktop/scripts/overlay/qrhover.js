
// QR hover decode: report the element under the cursor so main can crop and decode it locally.
// Top-frame http(s) pages only; this script never reads image bytes, uploads or fetches anything.
if (typeof ipcRenderer !== "undefined" && window === window.top && /^https?:$/.test(location.protocol)) (() => {
  const SEL = "img,canvas,svg,[data-qr]";
  const MIN = 24, MAX = 2048, THROTTLE = 120;
  const SAFE = /^(https?:|lodica:|mailto:|tel:)/i;
  let sentAt = -Infinity, lastKey = "", lastNonce = "", lastEl = null, lastRect = null, cleared = true, result = null, seq = 0;

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
    cleared = true; lastKey = ""; lastNonce = ""; lastEl = null; lastRect = null; sentAt = -Infinity; result = null;
    ipcRenderer.send("qrHover", { clear: true });
  }
  // Main echoes the decode with a nonce for the exact crop it belongs to, so only a real QR blocks a page click.
  if (ipcRenderer.on) ipcRenderer.on("qrResult", (_e, d) => { result = d || null; });
  function onClick(e) {
    if (!result || !lastKey || result.key !== lastKey || !result.nonce || result.nonce !== lastNonce) return;
    if (!SAFE.test(String(result.url || ""))) return;
    // The click must land on the element that was decoded, not on some control that replaced it without a new hover.
    if (lastEl && targetOf(e) !== lastEl) return;
    if (lastRect && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
      const pad = 4;
      if (e.clientX < lastRect.left - pad || e.clientX > lastRect.right + pad ||
          e.clientY < lastRect.top - pad || e.clientY > lastRect.bottom + pad) return;
    }
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    ipcRenderer.send("qrClick", { url: result.url });
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
    const key = [tag, x, y, width, height, String(src).slice(0, 200)].join("|");
    const at = Date.now();
    if (key === lastKey || at - sentAt < THROTTLE) return;
    cleared = false; sentAt = at; lastKey = key; lastEl = el; lastRect = r; result = null;
    lastNonce = at + "|" + (++seq);
    ipcRenderer.send("qrHover", { x, y, width, height, tag, cx: e.clientX, cy: e.clientY, key, nonce: lastNonce });
  }
  document.addEventListener("pointermove", onMove, true);
  // Only a pointer leaving the document clears. Capture-phase pointerleave fires on every child crossing and made the
  // tooltip flash whenever the pointer crossed an element boundary inside the same QR image.
  document.addEventListener("pointerleave", (e) => { if (!e || !e.relatedTarget) clear(); });
  addEventListener("blur", clear);
  document.addEventListener("click", onClick, true);
})();
