"use strict";
// Remove a plain background from an emoji picture: flood fill from the border over pixels close to the corner colour.
// Works on a BGRA buffer (what Electron's nativeImage.toBitmap gives). Returns true when something was cleared.
function removeBackground(buf, w, h, tol = 40) {
  if (!w || !h || buf.length < w * h * 4) return false;
  const px = (x, y) => (y * w + x) * 4;
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  // Already transparent corners: nothing to do.
  if (corners.every(i => buf[i + 3] < 16)) return false;
  const base = corners.find(i => buf[i + 3] >= 16);
  const [b0, g0, r0] = [buf[base], buf[base + 1], buf[base + 2]];
  // The four corners must agree, or the background is not plain.
  for (const i of corners) {
    if (buf[i + 3] < 16) continue;
    if (Math.abs(buf[i] - b0) + Math.abs(buf[i + 1] - g0) + Math.abs(buf[i + 2] - r0) > tol) return false;
  }
  const near = i => buf[i + 3] < 16 || Math.abs(buf[i] - b0) + Math.abs(buf[i + 1] - g0) + Math.abs(buf[i + 2] - r0) <= tol;
  const seen = new Uint8Array(w * h), stack = [];
  const push = (x, y) => { const k = y * w + x; if (!seen[k] && near(k * 4)) { seen[k] = 1; stack.push(k); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  let n = 0;
  while (stack.length) {
    const k = stack.pop(), x = k % w, y = (k - x) / w;
    // The bitmap is premultiplied: a cleared pixel must be all zero, or its old colour shows as white.
    buf[k * 4] = 0; buf[k * 4 + 1] = 0; buf[k * 4 + 2] = 0; buf[k * 4 + 3] = 0; n++;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  // Refuse to wipe the whole picture.
  return n > 0 && n < w * h * 0.95;
}
module.exports = { removeBackground };
