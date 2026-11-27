"use strict";
// Edit text in the PDF viewer. "Edit text" makes every word of the page text layer editable in place. Saving covers the old
// words with a white box and writes the new text on top (pdf-lib, standard fonts), then saves a copy through the app.
// The file's own text stays underneath the box, and the new text uses a standard font, not the document's font.
(() => {
  const edits = new Map(); // span -> { page, x, y, w, h, fontPx, old, now }
  let on = false;
  let btn = null, saveBtn = null;

  const app = () => window.PDFViewerApplication;
  const say = (t) => {
    let m = document.getElementById("lodicaEditMsg");
    if (!m) { m = document.createElement("div"); m.id = "lodicaEditMsg"; document.body.appendChild(m); }
    m.textContent = t;
    clearTimeout(say.t); say.t = setTimeout(() => m.remove(), 3500);
  };

  function setMode(v) {
    on = !!v;
    document.body.classList.toggle("lodica-edit", on);
    if (btn) btn.classList.toggle("on", on);
    if (on) say("Click a word to edit it");
  }

  /** Where a text-layer span sits on its page, in PDF units. */
  function place(span) {
    const pageEl = span.closest(".page");
    if (!pageEl) return null;
    const num = Number(pageEl.getAttribute("data-page-number"));
    const view = app().pdfViewer.getPageView(num - 1);
    if (!view || !view.viewport) return null;
    const pr = pageEl.querySelector(".canvasWrapper, canvas") ? pageEl.getBoundingClientRect() : pageEl.getBoundingClientRect();
    const r = span.getBoundingClientRect();
    const x = r.left - pr.left, y = r.top - pr.top;
    const vp = view.viewport;
    const [x1, y1] = vp.convertToPdfPoint(x, y + r.height); // bottom left
    const [x2, y2] = vp.convertToPdfPoint(x + r.width, y);  // top right
    const fontPx = parseFloat(getComputedStyle(span).fontSize) || r.height;
    return { page: num - 1, x1, y1, x2, y2, size: fontPx / (vp.scale || 1), family: getComputedStyle(span).fontFamily || "" };
  }

  function start(span) {
    if (span.classList.contains("lodica-editing")) return;
    const where = place(span);
    if (!where) return;
    if (!edits.has(span)) edits.set(span, Object.assign({ old: span.textContent, now: span.textContent }, where));
    span.classList.add("lodica-editing");
    span.setAttribute("contenteditable", "plaintext-only");
    span.spellcheck = true;
    span.focus();
  }

  document.addEventListener("click", (e) => {
    if (!on) return;
    const span = e.target && e.target.closest && e.target.closest(".textLayer span");
    if (!span || !span.closest("#viewer")) return;
    e.preventDefault();
    start(span);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target && e.target.classList && e.target.classList.contains("lodica-editing")) { e.preventDefault(); e.target.blur(); }
  }, true);

  document.addEventListener("input", (e) => {
    const rec = edits.get(e.target);
    if (!rec) return;
    rec.now = e.target.textContent;
    if (saveBtn) saveBtn.hidden = ![...edits.values()].some((r) => r.now !== r.old);
  }, true);

  document.addEventListener("focusout", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("lodica-editing")) {
      e.target.removeAttribute("contenteditable");
      // the box stays white so the edit stays readable on the canvas until it is saved
    }
  }, true);

  const std = (family, PDFLib) => {
    const f = String(family).toLowerCase();
    return /mono|courier|consolas/.test(f) ? PDFLib.StandardFonts.Courier : /serif/.test(f) && !/sans/.test(f) ? PDFLib.StandardFonts.TimesRoman : PDFLib.StandardFonts.Helvetica;
  };
  // Standard fonts only draw Latin-1; anything else is replaced so saving never fails on one character.
  const latin = (t) => String(t).replace(/[^\x20-\x7e -ÿ]/g, "?");

  async function save() {
    const a = app();
    const changed = [...edits.values()].filter((r) => r.now !== r.old);
    if (!changed.length) { say("Nothing changed"); return; }
    say("Saving…");
    try {
      const { PDFDocument, rgb } = PDFLib;
      const doc = await PDFDocument.load(await a.pdfDocument.getData(), { ignoreEncryption: true });
      const fonts = new Map();
      const font = async (family) => {
        const name = std(family, PDFLib);
        if (!fonts.has(name)) fonts.set(name, await doc.embedFont(name));
        return fonts.get(name);
      };
      for (const r of changed) {
        const pg = doc.getPage(r.page);
        const pad = Math.max(1, r.size * 0.12);
        pg.drawRectangle({ x: Math.min(r.x1, r.x2) - pad, y: Math.min(r.y1, r.y2) - pad * 0.6, width: Math.abs(r.x2 - r.x1) + pad * 2, height: Math.abs(r.y2 - r.y1) + pad * 1.2, color: rgb(1, 1, 1), borderWidth: 0 });
        const text = latin(r.now);
        if (!text.trim()) continue;
        pg.drawText(text, { x: Math.min(r.x1, r.x2), y: Math.min(r.y1, r.y2) + Math.abs(r.y2 - r.y1) * 0.22, size: r.size, font: await font(r.family), color: rgb(0, 0, 0) });
      }
      const bytes = await doc.save();
      const name = (decodeURIComponent((new URLSearchParams(location.search).get("file") || "").split("?")[0].split("/").pop()) || "document.pdf").replace(/\.pdf$/i, "") + "-edited";
      const res = await fetch("/pdf-save-raw?name=" + encodeURIComponent(name), { method: "POST", body: bytes });
      say(res.status === 204 ? "Save cancelled" : res.ok ? "Saved " + (await res.text()) : "Save failed");
      if (res.ok && res.status !== 204) { for (const r of changed) r.old = r.now; saveBtn.hidden = true; }
    } catch (e) { say("Save failed: " + (e && e.message || e)); }
  }

  function mount() {
    const bar = document.getElementById("toolbarViewerRight");
    if (!bar || document.getElementById("lodicaEditText")) return !!bar;
    btn = document.createElement("button");
    btn.id = "lodicaEditText"; btn.className = "toolbarButton"; btn.type = "button"; btn.textContent = "Edit text"; btn.title = "Click a word to change it";
    btn.addEventListener("click", () => setMode(!on));
    saveBtn = document.createElement("button");
    saveBtn.id = "lodicaSaveEdited"; saveBtn.className = "toolbarButton"; saveBtn.type = "button"; saveBtn.textContent = "Save edited PDF"; saveBtn.hidden = true;
    saveBtn.addEventListener("click", save);
    bar.insertBefore(saveBtn, bar.firstChild);
    bar.insertBefore(btn, bar.firstChild);
    return true;
  }
  const t = setInterval(() => { if (window.PDFViewerApplication && mount()) clearInterval(t); }, 200);
  window.__lodicaPdfEdit = { setMode, start, edits, save, place };
})();
