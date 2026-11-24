"use strict";
// Local QR generator and local decode tooltip. Nothing is uploaded.

let QR_DECODE = null;

function qrLink(url) {
  const u = String(url || "").trim();
  return /^(https?:|lodica:|mailto:|tel:)/i.test(u) && u.length <= 2000 ? u : "";
}

function openDecoded(url) {
  if (!url) return;
  // Web and Lodica links belong in a new Lodica tab; mail and phone links go to the OS handler.
  if (/^(https?:|lodica:)/i.test(url)) inv("tab.new", { url });
  else inv("openExternal", url);
}

function hideQrDecoded() {
  if (QR_DECODE) { QR_DECODE.close(); QR_DECODE = null; }
}

async function copyQrText(text) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); toast("Copied QR text"); }
  catch { toast("Could not copy"); }
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

/** Decoded payloads become a real anchor when they are a safe URL; other payloads stay exact text. */
function decodedPayload(text) {
  const url = qrLink(text);
  if (!url) return h("div", { class: "qr-url", text });
  return h("a", {
    class: "qr-url qr-open",
    href: url,
    title: "Open " + url,
    text: url,
    rel: "noopener noreferrer",
    on: { click: (e) => {
      e.preventDefault();
      const target = QR_DECODE && QR_DECODE.openUrl;
      hideQrDecoded();
      openDecoded(target);
    } },
  });
}

/** Decoded payload from a hovered page QR or from the generator preview: exact text and a clickable link, cursor-positioned. */
function showQrDecoded(d) {
  if (!d || typeof d.url !== "string" || !d.url) { hideQrDecoded(); return; }
  const text = d.url;
  const link = qrLink(text);
  const x = Number.isFinite(d.x) ? d.x : (innerWidth || 0) / 2;
  const y = Number.isFinite(d.y) ? d.y : (innerHeight || 0) / 2;
  if (QR_DECODE && !QR_DECODE.closed) {
    if (QR_DECODE.decodedText !== text && QR_DECODE.urlEl) {
      const next = decodedPayload(text);
      if (QR_DECODE.urlEl.parentNode) QR_DECODE.urlEl.parentNode.replaceChild(next, QR_DECODE.urlEl);
      QR_DECODE.urlEl = next;
      QR_DECODE.decodedText = text;
    }
    QR_DECODE.openUrl = link;
    placeQrDecoded(x, y);
    return;
  }
  const payload = decodedPayload(text);
  QR_DECODE = openLayer({ key: "qrdecoded", dim: false, cls: "hoverqr-layer qr-decoded-layer", onClose: () => { QR_DECODE = null; } }, () =>
    h("div", { class: "hoverqr qr-decoded" },
      h("div", { class: "t2", text: "Decoded QR" }),
      payload,
      h("button", { class: "chip", text: "Copy", act: () => copyQrText(QR_DECODE && QR_DECODE.decodedText || "") })));
  QR_DECODE.decodedText = text;
  QR_DECODE.urlEl = payload;
  QR_DECODE.openUrl = link;
  placeQrDecoded(x, y);
}

function openQr() {
  return sheet({ title: "QR code", key: "qr", onClose: hideQrDecoded }, (b) => {
    let timer = 0, current = "", hoverToken = 0;
    // Permanent, entirely client-side: any text pasted here becomes a QR that never expires or uploads.
    const input = h("input", { class: "sp-find", type: "text", placeholder: "Type or paste any URL / text", "aria-label": "Custom QR text" });
    const useTab = btn("Use tab URL", () => { input.value = (S.tab && S.tab.url) || ""; update(); });
    const img = h("img", { class: "qr-img", alt: "QR preview", width: 224, height: 224 });
    const png = h("a", { class: "btn", download: "lodica-qr.png" }, "PNG");
    const svg = h("a", { class: "btn", download: "lodica-qr.svg" }, "SVG");
    const copy = btn("Copy text", async () => {
      if (!current) return;
      try { await navigator.clipboard.writeText(current); toast("Copied QR text"); } catch { toast("Could not copy"); }
    });
    const copyImage = btn("Copy image", async () => {
      if (!img.src) return;
      try {
        const blob = await (await fetch(img.src)).blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast("Copied QR image");
      } catch { toast("Could not copy image"); }
    });
    const update = async () => {
      clearTimeout(timer);
      const text = String(input.value || "").trim();
      if (!text || text.length > 2000) {
        img.removeAttribute("src"); png.removeAttribute("href"); svg.removeAttribute("href"); current = ""; return;
      }
      const [src, vector] = await Promise.all([
        inv("qr", text).catch(() => null),
        inv("qr.svg", text).catch(() => null),
      ]);
      if (!src || !input.isConnected || input.value.trim() !== text) return;
      current = text;
      img.src = src;
      png.href = src;
      svg.href = vector ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(vector) : "";
      if (!vector) svg.removeAttribute("href");
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
      h("div", { class: "row" }, input, useTab),
      h("div", { class: "qr-preview" }, img),
      h("div", { class: "row" }, copy, copyImage, png, svg));
    input.value = (S.tab && S.tab.url) || "";
    update();
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}
