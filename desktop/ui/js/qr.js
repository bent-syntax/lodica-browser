"use strict";
// Local QR generator, link-hover preview and local decode tooltip. Nothing is uploaded.

let QR_HOVER = null, QR_HOVER_TIMER = 0, QR_HOVER_URL = "", QR_DECODE = null;

function qrLink(url) {
  const u = String(url || "").trim();
  return /^(https?:|lodica:|mailto:|tel:)/i.test(u) && u.length <= 2000 ? u : "";
}

function hideQrHover() {
  clearTimeout(QR_HOVER_TIMER);
  if (QR_HOVER) { QR_HOVER.close(); QR_HOVER = null; }
  QR_HOVER_URL = "";
}

function showQrHover(d) {
  const url = qrLink(d && d.url);
  if (!url) { QR_HOVER_TIMER = setTimeout(hideQrHover, 350); return; }
  clearTimeout(QR_HOVER_TIMER);
  if (QR_HOVER && QR_HOVER_URL === url) return;
  if (QR_HOVER) QR_HOVER.close();
  QR_HOVER_URL = url;
  QR_HOVER = openLayer({ key: "hoverqr", dim: false, cls: "hoverqr-layer", onClose: () => { QR_HOVER = null; QR_HOVER_URL = ""; } }, () => {
    const img = h("img", { class: "qr-img", alt: "QR code", width: 144, height: 144 });
    const root = h("div", { class: "hoverqr" },
      img,
      h("div", { class: "t2", text: "Link to scan" }),
      h("div", { class: "qr-url", text: url }));
    inv("qr", url).then((src) => { if (src && img.isConnected) img.src = src; }).catch(() => {});
    return root;
  });
}

// Decoded payloads from a hovered page QR or from the generator preview: exact text, cursor-positioned.
function hideQrDecoded() {
  if (QR_DECODE) { QR_DECODE.close(); QR_DECODE = null; }
}

function placeQrDecoded(x, y) {
  if (!QR_DECODE || !QR_DECODE.el) return;
  const el = QR_DECODE.el.querySelector(".hoverqr.qr-decoded");
  if (!el) return;
  const w = el.offsetWidth || 260, hh = el.offsetHeight || 72;
  const left = Math.min(Math.max(8, Math.round(x) + 16), Math.max(8, (innerWidth || 0) - w - 8));
  const top = Math.min(Math.max(8, Math.round(y) + 16), Math.max(8, (innerHeight || 0) - hh - 8));
  el.style.left = left + "px";
  el.style.top = top + "px";
  el.style.right = "auto";
  el.style.bottom = "auto";
}

function showQrDecoded(d) {
  if (!d || typeof d.url !== "string" || !d.url) { hideQrDecoded(); return; }
  const text = d.url;
  const x = Number.isFinite(d.x) ? d.x : (innerWidth || 0) / 2;
  const y = Number.isFinite(d.y) ? d.y : (innerHeight || 0) / 2;
  if (QR_DECODE && !QR_DECODE.closed) {
    if (QR_DECODE.decodedText !== text && QR_DECODE.urlEl) {
      QR_DECODE.urlEl.textContent = text;
      QR_DECODE.decodedText = text;
    }
    placeQrDecoded(x, y);
    return;
  }
  QR_DECODE = openLayer({ key: "qrdecoded", dim: false, cls: "hoverqr-layer qr-decoded-layer", onClose: () => { QR_DECODE = null; } }, () =>
    h("div", { class: "hoverqr qr-decoded" },
      h("div", { class: "t2", text: "Decoded QR" }),
      h("div", { class: "qr-url", text })));
  QR_DECODE.decodedText = text;
  QR_DECODE.urlEl = QR_DECODE.el.querySelector(".qr-url");
  placeQrDecoded(x, y);
}

function openQr() {
  return sheet({ title: "QR code", key: "qr", onClose: hideQrDecoded }, (b) => {
    let timer = 0, current = "", hoverToken = 0;
    const input = h("input", { class: "sp-find", type: "url", placeholder: "Text or link to encode", "aria-label": "Text or link" });
    const img = h("img", { class: "qr-img", alt: "QR preview", width: 224, height: 224 });
    const link = h("a", { class: "btn", download: "lodica-qr.png" }, "Download");
    const copy = btn("Copy link", async () => {
      if (!current) return;
      try { await navigator.clipboard.writeText(current); toast("Copied"); } catch { toast("Could not copy"); }
    });
    const update = async () => {
      clearTimeout(timer);
      const text = String(input.value || "").trim();
      if (!text || text.length > 2000) { img.removeAttribute("src"); link.removeAttribute("href"); current = ""; return; }
      const src = await inv("qr", text).catch(() => null);
      if (!src || !input.isConnected || input.value.trim() !== text) return;
      current = text;
      img.src = src;
      link.href = src;
    };
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 120); });
    img.addEventListener("pointerenter", async (e) => {
      const token = ++hoverToken;
      let decoded = "";
      if (img.src && /^data:image\//.test(img.src)) {
        try { decoded = await inv("qr.decode", img.src); } catch { /* fallback to the encoded text */ }
      }
      if (token === hoverToken) showQrDecoded({ url: decoded || current || "", x: e.clientX, y: e.clientY });
    });
    img.addEventListener("pointerleave", () => { hoverToken++; hideQrDecoded(); });
    b.append(
      h("div", { class: "row" }, input),
      h("div", { class: "qr-preview" }, img),
      h("div", { class: "row" }, copy, link));
    input.value = (S.tab && S.tab.url) || "";
    update();
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}
