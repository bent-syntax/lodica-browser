"use strict";
// Local QR generator and link-hover preview. The code is rendered by the main process; nothing is uploaded.

let QR_HOVER = null, QR_HOVER_TIMER = 0, QR_HOVER_URL = "";

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

function openQr() {
  return sheet({ title: "QR code", key: "qr" }, (b) => {
    let timer = 0, current = "";
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
    b.append(
      h("div", { class: "row" }, input),
      h("div", { class: "qr-preview" }, img),
      h("div", { class: "row" }, copy, link));
    input.value = (S.tab && S.tab.url) || "";
    update();
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}
