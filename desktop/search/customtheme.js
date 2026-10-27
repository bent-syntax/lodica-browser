"use strict";
// Turns the custom theme colours (four required, raised, high and muted optional) into the CSS variables the themes use. Shared by the browser UI and the start page.
function customVars(c) {
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const mix = (a, b, p) => "color-mix(in srgb," + a + " " + p + "%," + b + ")";
  return {
    "--bg": c.bg, "--raised": c.raised || mix(c.text, c.bg, 8), "--high": c.high || mix(c.text, c.bg, 16), "--mist": c.text, "--text": c.text,
    "--muted": c.muted || mix(c.text, c.bg, 60), "--amber": c.accent, "--coral": c.accent2, "--link": c.accent, "--url": c.accent2, "--sub": c.text,
    "color-scheme": lum(c.bg) > 0.5 ? "light" : "dark",
  };
}
function applyCustom(root, theme, c) {
  const ok = c && ["bg", "text", "accent", "accent2"].every((k) => /^#[0-9a-f]{6}$/i.test(c[k]));
  const vars = ok && theme === "custom" ? customVars(c) : null;
  for (const k of ["--bg", "--raised", "--high", "--mist", "--text", "--muted", "--amber", "--coral", "--link", "--url", "--sub", "color-scheme"]) {
    if (vars) root.style.setProperty(k, vars[k]); else root.style.removeProperty(k);
  }
}
