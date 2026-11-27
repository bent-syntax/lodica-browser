
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
  // The decoded link, drawn above the QR inside the page. Opaque, never takes the pointer, gone when the pointer leaves the QR.
  let box = null;
  function hideBox() { if (box) { try { box.remove(); } catch (e) { /* gone */ } box = null; } }
  function showBox(url, r, th) {
    hideBox();
    if (!document.createElement || !document.documentElement) return;
    const col = (v, d) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);
    const bg = col(th && th.bg, "#17181B"), fg = col(th && th.text, "#ECEDEE"), mu = col(th && th.muted, "#A0A4AB");
    const el = document.createElement("div");
    const line = document.createElement("div"), hint = document.createElement("div");
    line.textContent = url; hint.textContent = "Click the QR code again to open";
    Object.assign(el.style, { all: "initial", position: "fixed", zIndex: "2147483647", pointerEvents: "none", boxSizing: "border-box", maxWidth: "340px",
      padding: "8px 12px", borderRadius: "12px", background: bg, border: "1px solid " + mu + "55", boxShadow: "0 8px 24px rgba(0,0,0,.35)", fontFamily: "system-ui,Segoe UI,sans-serif", left: "0px", top: "0px" });
    Object.assign(line.style, { all: "initial", display: "block", color: fg, font: "13px system-ui,Segoe UI,sans-serif", wordBreak: "break-all" });
    Object.assign(hint.style, { all: "initial", display: "block", marginTop: "2px", color: mu, font: "12px system-ui,Segoe UI,sans-serif" });
    el.appendChild(line); el.appendChild(hint);
    document.documentElement.appendChild(el);
    const w = el.offsetWidth || 260, h = el.offsetHeight || 48, vw = typeof innerWidth === "number" && innerWidth > 0 ? innerWidth : 1024;
    const left = Math.min(Math.max(8, Math.round(r.left + r.width / 2 - w / 2)), Math.max(8, vw - w - 8));
    const top = r.top - h - 6 >= 8 ? Math.round(r.top - h - 6) : Math.round(r.top + r.height + 6);
    el.style.left = left + "px"; el.style.top = top + "px";
    box = el;
  }
  function clear() {
    hideBox();
    if (cleared) return;
    cleared = true; lastKey = ""; lastNonce = ""; lastEl = null; lastRect = null; sentAt = -Infinity; result = null;
    ipcRenderer.send("qrHover", { clear: true });
  }
  // Main echoes the decode with a nonce for the exact crop it belongs to, so only a real QR blocks a page click.
  if (ipcRenderer.on) ipcRenderer.on("qrResult", (_e, d) => {
    result = d || null;
    if (result && lastRect && result.key === lastKey && result.nonce && result.nonce === lastNonce && SAFE.test(String(result.url || ""))) showBox(result.url, lastRect, result.theme);
  });
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
      hideBox();
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
  addEventListener("scroll", clear, { capture: true, passive: true });
  document.addEventListener("click", onClick, true);
})();
