"use strict";
// Opens a .docx with its own layout (docx-preview draws the pages from the file) and lets every typed paragraph be edited.
// Saving never rebuilds the document: the edited text is written back into the original file's XML, so styles, page setup,
// headers, images and every paragraph that was not touched stay byte for byte as they were.
const src = new URLSearchParams(location.search).get("u") || "";
const page = document.getElementById("page"), msg = document.getElementById("msg"), saveBtn = document.getElementById("save");
const say = (t) => { msg.textContent = t; };
const name = decodeURIComponent((src.split("?")[0].split("/").pop()) || "Document");
document.title = name;
document.getElementById("title").textContent = name;

let original = null; // the file as it was opened (ArrayBuffer)
let pairs = [];      // { el, xmlIndex, text }: rendered paragraph, its w:p in document.xml, and its text when opened

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const norm = (s) => String(s || "").replace(/[ \s]+/g, " ").trim();

/** Every body paragraph of document.xml in document order, skipping text boxes and fallbacks that the renderer does not draw as paragraphs. */
function xmlParagraphs(doc) {
  const out = [];
  for (const p of doc.getElementsByTagNameNS(W, "p")) {
    let skip = false;
    for (let n = p.parentNode; n && n.nodeType === 1; n = n.parentNode) {
      if (n.localName === "txbxContent" || n.localName === "Fallback") { skip = true; break; }
    }
    if (!skip) out.push(p);
  }
  return out;
}
const textRuns = (p) => [...p.getElementsByTagNameNS(W, "r")].filter((r) => r.getElementsByTagNameNS(W, "t").length);
const xmlText = (p) => [...p.getElementsByTagNameNS(W, "t")].map((t) => t.textContent).join("");

/** Pairs rendered paragraphs with XML paragraphs by walking both in order and matching their text; unmatched ones stay read only. */
function align(domPs, xmlPs) {
  const res = [];
  let j = 0;
  for (const el of domPs) {
    const t = norm(el.textContent);
    let k = -1;
    for (let x = j; x < Math.min(xmlPs.length, j + 6); x++) if (norm(xmlText(xmlPs[x])) === t) { k = x; break; }
    if (k < 0) continue;
    res.push({ el, xmlIndex: k, text: el.textContent });
    j = k + 1;
  }
  return res;
}

async function open() {
  const r = await fetch("/docx-raw?u=" + encodeURIComponent(src));
  if (!r.ok) throw new Error(r.status);
  original = await r.arrayBuffer();
  await docx.renderAsync(original.slice(0), page, null, {
    className: "docx", inWrapper: true, breakPages: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false,
    renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, experimental: true, useBase64URL: true,
  });
  const zip = await JSZip.loadAsync(original);
  const xml = new DOMParser().parseFromString(await zip.file("word/document.xml").async("string"), "application/xml");
  const body = [...page.querySelectorAll("section.docx > article p")];
  pairs = align(body, xmlParagraphs(xml));
  for (const p of pairs) {
    p.el.setAttribute("data-pi", String(p.xmlIndex));
    p.el.contentEditable = "true";
    p.el.spellcheck = true;
    // One paragraph stays one paragraph: Enter would split the rendered tree away from the file's structure.
    p.el.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
    p.el.addEventListener("paste", (e) => { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData.getData("text/plain") || "").replace(/[\r\n]+/g, " ")); });
    p.el.addEventListener("drop", (e) => e.preventDefault());
    p.el.addEventListener("input", () => { saveBtn.disabled = false; say("Edited"); });
  }
  say(pairs.length + " paragraphs can be edited");
}

/** The changed paragraphs written into a copy of the original file. */
async function build() {
  const zip = await JSZip.loadAsync(original);
  const xml = new DOMParser().parseFromString(await zip.file("word/document.xml").async("string"), "application/xml");
  const xps = xmlParagraphs(xml);
  let changed = 0;
  for (const { el, xmlIndex, text } of pairs) {
    const now = el.textContent;
    if (now === text) continue;
    const p = xps[xmlIndex];
    if (!p) continue;
    const runs = textRuns(p);
    const spans = [...el.querySelectorAll("span")].filter((s) => !s.querySelector("span"));
    const setRun = (run, t) => {
      const ts = [...run.getElementsByTagNameNS(W, "t")];
      ts.forEach((n, i) => { if (i) n.parentNode.removeChild(n); });
      const first = ts[0];
      first.textContent = t;
      first.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
    };
    if (runs.length && spans.length === runs.length) runs.forEach((r, i) => setRun(r, spans[i].textContent)); // every run keeps its own formatting
    else if (runs.length) { setRun(runs[0], now); runs.slice(1).forEach((r) => r.parentNode.removeChild(r)); } // the paragraph keeps its first run's look
    else continue;
    changed++;
  }
  zip.file("word/document.xml", new XMLSerializer().serializeToString(xml));
  return { bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), changed };
}

saveBtn.onclick = async () => {
  say("Saving…");
  try {
    const { bytes } = await build();
    const r = await fetch("/docx-save-raw?name=" + encodeURIComponent(name.replace(/\.docx?$/i, "")), { method: "POST", body: bytes });
    say(r.status === 204 ? "Save cancelled" : r.ok ? "Saved " + (await r.text()) : "Save failed");
    if (r.ok && r.status !== 204) saveBtn.disabled = true;
  } catch (e) { say("Save failed: " + e.message); }
};
document.getElementById("print").onclick = () => window.print();

window.__docxTest = { build, pairs: () => pairs };
open().catch((e) => say("Could not open this document: " + e.message));
