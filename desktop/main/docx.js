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

module.exports = { toPdf };
