
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
  // Nothing happens on hover (hover decoding made the tooltip flicker). The first click decodes the image under the pointer
  // and shows the link; the next click on the same image opens it. A click that is not on a QR hides the tooltip.
  function describe(e) {
    const el = targetOf(e);
    if (!el || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return null;
    const r = el.getBoundingClientRect && el.getBoundingClientRect();
    if (!r || !(r.width >= MIN) || !(r.height >= MIN) || r.width > MAX || r.height > MAX) return null;
    if (typeof getComputedStyle === "function") {
      const cs = getComputedStyle(el);
      if (!cs || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return null;
    }
    // capturePage takes document coordinates; the cursor stays in viewport coordinates for the tooltip.
    const x = Math.round(r.left + (typeof scrollX === "number" ? scrollX : 0));
    const y = Math.round(r.top + (typeof scrollY === "number" ? scrollY : 0));
    const width = Math.round(r.width), height = Math.round(r.height);
    const tag = el.hasAttribute && el.hasAttribute("data-qr") ? "qr" : (el.tagName ? String(el.tagName).toLowerCase() : "qr");
    const src = el.currentSrc || el.src || (el.getAttribute && el.getAttribute("href")) || "";
    const key = [tag, x, y, width, height, String(src).slice(0, 200)].join("|");
    return { el, r, x, y, width, height, tag, key };
  }
  function onClick(e) {
    const d = describe(e);
    if (!d) { clear(); return; }
    // Second click: main already confirmed this exact image is a QR with a safe link, so open it instead of the page's own click.
    if (result && d.key === lastKey && result.key === lastKey && result.nonce && result.nonce === lastNonce && SAFE.test(String(result.url || ""))) {
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      ipcRenderer.send("qrClick", { url: result.url });
      return;
    }
    if (d.key === lastKey) return; // decode still running
    cleared = false; sentAt = Date.now(); lastKey = d.key; lastEl = d.el; lastRect = d.r; result = null;
    lastNonce = sentAt + "|" + (++seq);
    ipcRenderer.send("qrHover", { x: d.x, y: d.y, width: d.width, height: d.height, tag: d.tag, cx: e.clientX, cy: e.clientY, key: d.key, nonce: lastNonce, vx: d.r.left, vy: d.r.top });
  }
  // The link box stays while the pointer is on the QR and goes as soon as it leaves it.
  document.addEventListener("pointermove", (e) => {
    if (cleared || !lastRect) return;
    const pad = 2;
    if (e.clientX < lastRect.left - pad || e.clientX > lastRect.right + pad || e.clientY < lastRect.top - pad || e.clientY > lastRect.bottom + pad) clear();
  }, true);
  addEventListener("blur", clear);
  addEventListener("scroll", clear, { capture: true, passive: true });
  document.addEventListener("click", onClick, true);
})();
