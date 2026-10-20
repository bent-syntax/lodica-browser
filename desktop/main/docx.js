"use strict";
const { BrowserWindow, net } = require("electron");

// A .docx is turned into a PDF so it opens in the same pdf.js viewer as any other PDF.
const MAX_BYTES = 50 * 1024 * 1024;
const CSS = "body{font:12pt/1.45 Calibri,Arial,sans-serif;color:#111;margin:0}img{max-width:100%}" +
  "table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 6px}h1,h2,h3{line-height:1.2}";

async function toPdf(target) {
  const res = await net.fetch(target);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("File too large");
  const mammoth = require("mammoth");
  const { value } = await mammoth.convertToHtml({ buffer: buf });
  const page = "<!doctype html><meta charset=utf-8><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\"><style>" + CSS + "</style><body>" + value;
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false, offscreen: false } });
  try {
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page));
    return await win.webContents.printToPDF({ pageSize: "A4", printBackground: true, margins: { marginType: "default" } });
  } finally {
    win.destroy();
  }
}

async function load(target) {
  const res = await net.fetch(target);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("File too large");
  return buf;
}

/** The document body as editable HTML (headings, lists, bold/italic, tables, images). */
async function toHtml(target) {
  const { value } = await require("mammoth").convertToHtml({ buffer: await load(target) });
  return value;
}

const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const run = r => {
  const pr = (r.b ? "<w:b/>" : "") + (r.i ? "<w:i/>" : "") + (r.u ? '<w:u w:val="single"/>' : "");
  return "<w:r>" + (pr ? "<w:rPr>" + pr + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + esc(r.t) + "</w:t></w:r>";
};
const STYLES = { h1: "Heading1", h2: "Heading2", h3: "Heading3" };

/** Writes blocks [{tag, list, runs:[{t,b,i,u}]}] as a real .docx (headings, paragraphs, bullets, runs). */
async function fromBlocks(blocks) {
  const JSZip = require("jszip");
  const body = blocks.map(b => {
    const style = STYLES[b.tag] ? '<w:pStyle w:val="' + STYLES[b.tag] + '"/>' : "";
    const num = b.list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + (b.list === "ol" ? 2 : 1) + '"/></w:numPr>' : "";
    const ppr = style || num ? "<w:pPr>" + style + num + "</w:pPr>" : "";
    return "<w:p>" + ppr + (b.runs || []).map(run).join("") + "</w:p>";
  }).join("");
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const zip = new JSZip();
  zip.file("[Content_Types].xml", head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>');
  zip.file("_rels/.rels", head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/_rels/document.xml.rels", head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>');
  zip.file("word/document.xml", head + "<w:document " + NS + "><w:body>" + body + "</w:body></w:document>");
  const hs = (id, n, sz) => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="' + sz + '"/></w:rPr></w:style>';
  zip.file("word/styles.xml", head + "<w:styles " + NS + '><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/></w:rPr></w:style>' + hs("Heading1", 1, 40) + hs("Heading2", 2, 32) + hs("Heading3", 3, 28) + "</w:styles>");
  const lvl = f => '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="' + f + '"/><w:lvlText w:val="' + (f === "bullet" ? "\u2022" : "%1.") + '"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>';
  zip.file("word/numbering.xml", head + "<w:numbering " + NS + '><w:abstractNum w:abstractNumId="1">' + lvl("bullet") + '</w:abstractNum><w:abstractNum w:abstractNumId="2">' + lvl("decimal") + '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>');
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

module.exports = { toPdf, toHtml, fromBlocks };
