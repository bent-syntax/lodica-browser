"use strict";
// Reads text out of a picture (circle to search). Tesseract runs locally with the language files in ocr/tessdata; nothing is uploaded.
const path = require("path");

// Packaged, the language files and the OCR engine are unpacked from app.asar (worker threads cannot start from inside it).
const DIR = path.join(__dirname, "..", "ocr", "tessdata").replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);
const LANGS = "eng+nld+fra+deu";
let worker = null, idle = null;

async function get() {
  if (!worker) {
    const { createWorker } = require("tesseract.js");
    worker = await createWorker(LANGS, 1, { langPath: DIR, gzip: false, cacheMethod: "none" });
  }
  clearTimeout(idle);
  idle = setTimeout(async () => { const w = worker; worker = null; try { await w.terminate(); } catch { /* gone */ } }, 90e3);
  idle.unref?.();
  return worker;
}

/** Text found in a PNG/JPEG buffer, whitespace tidied; "" when there is none. */
async function recognize(buf) {
  const w = await get();
  const { data } = await w.recognize(buf);
  return String(data.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = { recognize };
