'use strict';
// Costume characters: a tiny SVG subset. Anything outside the allowlist is dropped, so the result is safe to show
// as an image on any client. Keep this file identical to desktop/main/faceart.js.

const MAX_IN = 6000;
const MAX_OUT = 2400;
const MAX_SHAPES = 40;
const NUM = '-?\\d{1,3}(?:\\.\\d{1,2})?';
const num = new RegExp('^' + NUM + '$');
const color = /^(?:none|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$/;
const unit = /^(?:0|1|0?\.\d{1,2})$/;
const pathData = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]{1,700}$/;
const pointList = /^[0-9.,\s-]{1,400}$/;
const coord = v => num.test(v) && Math.abs(parseFloat(v)) <= 128;

const STYLE = {
  fill: v => color.test(v),
  stroke: v => color.test(v),
  'stroke-width': v => num.test(v) && parseFloat(v) >= 0 && parseFloat(v) <= 12,
  'stroke-linecap': v => /^(?:round|butt|square)$/.test(v),
  'stroke-linejoin': v => /^(?:round|miter|bevel)$/.test(v),
  opacity: v => unit.test(v),
  'fill-opacity': v => unit.test(v),
};
const SHAPES = {
  circle: { cx: coord, cy: coord, r: coord },
  ellipse: { cx: coord, cy: coord, rx: coord, ry: coord },
  rect: { x: coord, y: coord, width: coord, height: coord, rx: coord, ry: coord },
  line: { x1: coord, y1: coord, x2: coord, y2: coord },
  polygon: { points: v => pointList.test(v) },
  polyline: { points: v => pointList.test(v) },
  path: { d: v => pathData.test(v) },
};
const NEEDS = { circle: ['r'], ellipse: ['rx', 'ry'], rect: ['width', 'height'], line: ['x1', 'y1', 'x2', 'y2'], polygon: ['points'], polyline: ['points'], path: ['d'] };

/** Returns a clean 64x64 SVG string built only from allowlisted shapes, or '' when [svg] has nothing drawable. */
function cleanArt(svg) {
  if (typeof svg !== 'string' || svg.length > MAX_IN) return '';
  const out = [];
  const tag = /<\s*([a-zA-Z]+)((?:\s+[a-zA-Z:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?\s*>/g;
  const attr = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = tag.exec(svg)) && out.length < MAX_SHAPES) {
    const name = m[1].toLowerCase();
    const allowed = SHAPES[name];
    if (!allowed) continue;
    const kept = {};
    let a;
    attr.lastIndex = 0;
    while ((a = attr.exec(m[2]))) {
      const k = a[1], v = (a[2] !== undefined ? a[2] : a[3]).trim();
      if (allowed[k] ? allowed[k](v) : STYLE[k] && STYLE[k](v)) kept[k] = v;
    }
    if (!NEEDS[name].every(k => k in kept)) continue;
    out.push('<' + name + Object.entries(kept).map(([k, v]) => ' ' + k + '="' + v + '"').join('') + '/>');
  }
  if (!out.length) return '';
  const res = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + out.join('') + '</svg>';
  return res.length <= MAX_OUT ? res : '';
}

module.exports = { cleanArt };
