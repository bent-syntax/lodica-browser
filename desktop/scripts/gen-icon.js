// Renders the Lodica kite launcher icon (graphite tile, gradient kite, spars, tail, bows) to build/icon.png.
// Pure Node: supersampled rasterizer + zlib PNG encoder, so no browser or native deps are needed.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 256, SS = 4;
const VIEW = { x: 14, y: 14, w: 80 }; // crop of the 108-unit adaptive icon viewport
const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const GRAPHITE = hex("#111827"), AMBER = hex("#F59E0B"), CORAL = hex("#F43F5E");

const inPoly = (pts, x, y) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const segDist = (x, y, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};
const lineDist = (x, y, pts) => {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, y, pts[i - 1], pts[i]));
  return d;
};
const cubic = (p0, p1, p2, p3, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
});

const body = [[54, 22], [72, 42], [54, 66], [36, 42]];
const facet = [[54, 22], [54, 42], [36, 42]];
const tail = [...cubic([54, 66], [50, 71], [58, 75], [54, 80]), ...cubic([54, 80], [51, 83.5], [55, 85.5], [53, 88]).slice(1)];
const bows = [
  [[[50.5, 72], [54, 74], [50.5, 76]], AMBER], [[[57.5, 72], [54, 74], [57.5, 76]], AMBER],
  [[[50.5, 80], [53.5, 82], [50.5, 84]], CORAL], [[[56.5, 80], [53.5, 82], [56.5, 84]], CORAL],
];
const grad = (x, y) => { // linear gradient (40,24) -> (66,64)
  const dx = 26, dy = 40;
  const t = Math.max(0, Math.min(1, ((x - 40) * dx + (y - 24) * dy) / (dx * dx + dy * dy)));
  return AMBER.map((v, i) => v + (CORAL[i] - v) * t);
};
const roundRect = (x, y, r) => {
  const x0 = VIEW.x, y0 = VIEW.y, x1 = VIEW.x + VIEW.w, y1 = VIEW.y + VIEW.w;
  const cx = Math.max(x0 + r, Math.min(x1 - r, x)), cy = Math.max(y0 + r, Math.min(y1 - r, y));
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && Math.hypot(x - cx, y - cy) <= r;
};
const over = (dst, [r, g, b, a]) => {
  const oa = a + dst[3] * (1 - a);
  if (!oa) return [0, 0, 0, 0];
  return [(r * a + dst[0] * dst[3] * (1 - a)) / oa, (g * a + dst[1] * dst[3] * (1 - a)) / oa, (b * a + dst[2] * dst[3] * (1 - a)) / oa, oa];
};

const sample = (x, y) => {
  let c = [0, 0, 0, 0];
  if (roundRect(x, y, 18)) c = over(c, GRAPHITE);
  if (inPoly(body, x, y)) c = over(c, grad(x, y));
  if (inPoly(facet, x, y)) c = over(c, [255, 255, 255, 0.2]);
  if (lineDist(x, y, [[54, 23.5], [54, 64.5]]) <= 0.8 || lineDist(x, y, [[37.5, 42], [70.5, 42]]) <= 0.8) c = over(c, hex("#111827", 0.8));
  if (lineDist(x, y, tail) <= 0.9) c = over(c, CORAL);
  for (const [tri, col] of bows) if (inPoly(tri, x, y)) c = over(c, col);
  return c;
};

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0;
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = VIEW.x + ((px + (sx + 0.5) / SS) / SIZE) * VIEW.w;
      const y = VIEW.y + ((py + (sy + 0.5) / SS) / SIZE) * VIEW.w;
      const c = sample(x, y);
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
    }
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0;
    raw[o + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]);
const out = path.join(__dirname, "..", "build", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log("icon written", out);
