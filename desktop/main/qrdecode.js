"use strict";
// Local QR decoding: hovered page images and the built-in generator. No network, no uploads.
const jsQR = require("jsqr");

const MAX_DATA_URL = 4 * 1024 * 1024;
const MAX_SIDE = 1200;
const MAX_PIXELS = 900000;

/** Electron bitmaps are BGRA; jsQR wants RGBA. */
function toRgba(img, width, height) {
  if (!img) return null;
  const size = img.getSize && img.getSize();
  const w = Number.isFinite(width) ? width : size && size.width;
  const h = Number.isFinite(height) ? height : size && size.height;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null;
  const bgra = img.toBitmap ? img.toBitmap() : img.bitmap;
  if (!bgra || bgra.length < w * h * 4) return null;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bgra[i + 2];
    data[i + 1] = bgra[i + 1];
    data[i + 2] = bgra[i];
    data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

/** Downscale large captures by area averaging so small QR modules survive. */
function fit(rgba) {
  const { data, width, height } = rgba;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  if (scale >= 1) return rgba;
  const nw = Math.max(1, Math.round(width * scale)), nh = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy0 = Math.floor(y * height / nh), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * height / nh));
    for (let x = 0; x < nw; x++) {
      const sx0 = Math.floor(x * width / nw), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * width / nw));
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const i = (sy * width + sx) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
      }
      const n = (sx1 - sx0) * (sy1 - sy0), j = (y * nw + x) * 4;
      out[j] = r / n; out[j + 1] = g / n; out[j + 2] = b / n; out[j + 3] = a / n;
    }
  }
  return { data: out, width: nw, height: nh };
}

/** Decodes RGBA pixels; returns the exact payload, or null. */
function decodeRgba(data, width, height) {
  if (!data || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (data.length < width * height * 4) return null;
  try {
    const scaled = fit({ data, width, height });
    const r = jsQR(scaled.data, scaled.width, scaled.height, { inversionAttempts: "attemptBoth" });
    return r && r.data ? String(r.data) : null;
  } catch { return null; }
}

/** Decodes a nativeImage (or anything exposing toBitmap/getSize). */
function decodeImage(img, width, height) {
  const rgba = toRgba(img, width, height);
  return rgba ? decodeRgba(rgba.data, rgba.width, rgba.height) : null;
}

/** Decodes a local data: image URL; refuses anything else and never fetches a URL. */
function decodeDataUrl(src) {
  if (typeof src !== "string" || src.length > MAX_DATA_URL) return null;
  if (!/^data:image\/(png|jpe?g|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=]+$/i.test(src)) return null;
  try {
    const { nativeImage } = require("electron");
    const img = nativeImage.createFromDataURL(src);
    return img && !img.isEmpty() ? decodeImage(img) : null;
  } catch { return null; }
}

module.exports = { decodeRgba, toRgba, decodeImage, decodeDataUrl };
