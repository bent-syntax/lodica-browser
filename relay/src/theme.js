'use strict';
// Checks a custom theme sent by a browser. Only hex colours, a texture name and an animation name pass through.
const hex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const REQUIRED = ['bg', 'text', 'accent', 'accent2'];
const EXTRA = ['raised', 'high', 'muted', 'danger', 'tab', 'tabText', 'tabEdge', 'startBg'];
const TEXTURES = ['stripes', 'dots', 'grid', 'checker', 'planks', 'gradient'];
const ANIMS = ['pulse', 'glow', 'drift', 'float', 'shimmer'];

/** Returns the cleaned theme, or null when the four required colours are missing. */
function cleanTheme(b, now = Date.now()) {
  if (!b || typeof b !== 'object' || !REQUIRED.every((k) => hex(b[k]))) return null;
  const out = { bg: b.bg, text: b.text, accent: b.accent, accent2: b.accent2, at: Number.isFinite(b.at) ? b.at : now };
  for (const k of EXTRA) if (hex(b[k])) out[k] = b[k];
  if (TEXTURES.includes(b.tabTex)) out.tabTex = b.tabTex;
  // Optional light variant (system-following theme) and animation preset.
  const l = b.light;
  if (l && typeof l === 'object' && REQUIRED.every((k) => hex(l[k]))) {
    out.light = {};
    for (const k of [...REQUIRED, ...EXTRA]) if (hex(l[k])) out.light[k] = l[k];
  }
  if (ANIMS.includes(b.anim)) out.anim = b.anim;
  return out;
}

module.exports = { cleanTheme, TEXTURES };
