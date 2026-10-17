// Renders the Lodica mark on a tile to a PNG buffer in any theme colors.
// Pure Node: supersampled rasterizer + zlib PNG encoder, so no browser or native deps are needed.
const zlib = require("zlib");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

const VIEW = { x: 14, y: 14, w: 80 }; // crop of the 108-unit adaptive icon viewport
const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

const inPoly = (pts, x, y) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const cubic = (p0, p1, p2, p3, n = 20) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
});
const quad = (p0, p1, p2, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [0, 1].map((k) => u * u * p0[k] + 2 * u * t * p1[k] + t * t * p2[k]);
});
const pill = (x, y, w, h = 16) => (px, py) => {
  const r = h / 2, cx = Math.max(x + r, Math.min(x + w - r, px));
  return py >= y && py <= y + h && Math.hypot(px - cx, py - (y + r)) <= r;
};

// The Lodica mark, viewBox 20 8 70 90: a pointer, three bars (the middle one is the accent) and a drop.
const MARK = { x: 20, y: 8, w: 70, h: 90 };
const arc = Array.from({ length: 13 }, (_, i) => { const a = Math.PI / 2 + (Math.PI * i) / 12; return [28 + 8 * Math.cos(a), 16 + 8 * Math.sin(a)]; });
const pointer = [...arc.reverse(), [28, 8], [40, 8], ...quad([40, 8], [44, 8], [46.5, 12]), [49, 16], [46.5, 20], ...quad([46.5, 20], [44, 24], [40, 24]), [28, 24]];
const drop = [...cubic([77, 68.5], [84.5, 68.5], [89, 79], [89, 86.5]), ...cubic([89, 86.5], [89, 92.5], [84, 96], [77, 96]),
  ...cubic([77, 96], [70, 96], [65, 92.5], [65, 86.5]), ...cubic([65, 86.5], [65, 79], [69.5, 68.5], [77, 68.5])];
const barA = pill(20, 32, 28), barB = pill(20, 56, 32), barC = pill(20, 80, 42);

/** PNG buffer of the mark on a rounded tile. [c] = {bg, text, amber} as #rrggbb: tile, mark body, accent bar. */
function render(SIZE = 256, c = {}, SS = 4) {
  const TILE = hex(c.bg || "#111827"), INK = hex(c.text || "#E5E7EB"), ACCENT = hex(c.amber || "#F59E0B");
  const roundRect = (x, y, r) => {
    const x0 = VIEW.x, y0 = VIEW.y, x1 = VIEW.x + VIEW.w, y1 = VIEW.y + VIEW.w;
    const cx = Math.max(x0 + r, Math.min(x1 - r, x)), cy = Math.max(y0 + r, Math.min(y1 - r, y));
    return x >= x0 && x <= x1 && y >= y0 && y <= y1 && Math.hypot(x - cx, y - cy) <= r;
  };
  const K = 0.66, mx = 54 - (MARK.x + MARK.w / 2) * K, my = 54 - (MARK.y + MARK.h / 2) * K;
  const sample = (x, y) => {
    if (!roundRect(x, y, 18)) return [0, 0, 0, 0];
    const u = (x - mx) / K, v = (y - my) / K;
    if (barB(u, v)) return ACCENT;
    if (barA(u, v) || barC(u, v) || inPoly(pointer, u, v) || inPoly(drop, u, v)) return INK;
    return TILE;
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
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const cache = new Map();
/** Same as render() but in a worker thread, so the main process never stalls. Cached per colors.
 *  If the worker can't start (packaged app, asar) or fails, falls back to rendering in-process; failures are never cached. */
function renderAsync(size, c) {
  const key = size + JSON.stringify(c);
  if (!cache.has(key)) {
    const p = new Promise((resolve) => {
      const inline = () => setImmediate(() => { try { resolve(render(size, c, 2)); } catch { resolve(null); } });
      let w;
      try { w = new Worker(__filename, { workerData: { size, c } }); } catch { return inline(); }
      w.once("message", m => resolve(Buffer.from(m)));
      w.once("error", inline);
    }).then(png => { if (!png) { cache.delete(key); throw new Error("icon render failed"); } return png; });
    cache.set(key, p);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

if (!isMainThread && workerData && workerData.size) parentPort.postMessage(render(workerData.size, workerData.c, 2));

module.exports = { render, renderAsync };
