"use strict";
const src = new URLSearchParams(location.search).get("u") || "";
const page = document.getElementById("page"), msg = document.getElementById("msg");
const say = t => { msg.textContent = t; };
document.title = decodeURIComponent((src.split("?")[0].split("/").pop()) || "Document");

fetch("/docx-html?u=" + encodeURIComponent(src)).then(r => r.ok ? r.text() : Promise.reject(new Error(r.status)))
  .then(h => { page.innerHTML = h; page.focus(); })
  .catch(e => say("Could not open this document: " + e.message));

for (const b of document.querySelectorAll("[data-c]")) b.onmousedown = e => { e.preventDefault(); document.execCommand(b.dataset.c); };
for (const b of document.querySelectorAll("[data-b]")) b.onmousedown = e => { e.preventDefault(); document.execCommand("formatBlock", false, b.dataset.b); };

/** Flattens the page into paragraphs/headings/list items with bold, italic and underline runs. */
function blocks() {
  const out = [];
  const runs = (n, st, acc) => {
    if (n.nodeType === 3) { if (n.nodeValue) acc.push({ t: n.nodeValue, b: st.b, i: st.i, u: st.u }); return; }
    if (n.nodeType !== 1) return;
    const t = n.tagName.toLowerCase();
    if (t === "br") { acc.push({ t: " ", ...st }); return; }
    const s = { b: st.b || t === "strong" || t === "b" || +n.style.fontWeight >= 600 || n.style.fontWeight === "bold",
      i: st.i || t === "em" || t === "i" || n.style.fontStyle === "italic",
      u: st.u || t === "u" || (n.style.textDecoration || "").includes("underline") };
    for (const c of n.childNodes) runs(c, s, acc);
  };
  const walk = (el, list) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) out.push({ tag: "p", list, runs: [{ t: n.nodeValue }] }); continue; }
      if (n.nodeType !== 1) continue;
      const t = n.tagName.toLowerCase();
      if (t === "ul" || t === "ol") { walk(n, t); continue; }
      if (t === "table") { for (const r of n.rows) out.push({ tag: "p", runs: [...r.cells].map(c => ({ t: c.textContent + "\t" })) }); continue; }
      if (t === "div" && [...n.children].some(c => /^(p|h[1-6]|ul|ol|table|div)$/i.test(c.tagName))) { walk(n, list); continue; }
      const acc = []; runs(n, {}, acc);
      out.push({ tag: /^h[1-3]$/.test(t) ? t : "p", list: t === "li" ? list : undefined, runs: acc });
    }
  };
  walk(page, undefined);
  return out;
}

document.getElementById("save").onclick = async () => {
  say("Saving…");
  try {
    const r = await fetch("/docx-save", { method: "POST", body: JSON.stringify({ name: document.title.replace(/\.(docx?|pdf)$/i, ""), blocks: blocks() }) });
    say(r.status === 204 ? "Save cancelled" : r.ok ? "Saved " + (await r.text()) : "Save failed");
  } catch (e) { say("Save failed: " + e.message); }
};
document.getElementById("pdf").onclick = () => { location.href = "/web/viewer.html?file=" + encodeURIComponent("/docx?u=" + encodeURIComponent(src)); };
