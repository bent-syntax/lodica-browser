"use strict";
// A custom theme may carry a light variant (c.light) that is used when the system is light, and an animation preset (c.anim).
// Turns the custom theme colours (four required, raised, high and muted optional) into the CSS variables the themes use. Shared by the browser UI and the start page.
function customVars(c) {
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const mix = (a, b, p) => "color-mix(in srgb," + a + " " + p + "%," + b + ")";
  return {
    "--bg": c.bg, "--raised": c.raised || mix(c.text, c.bg, 8), "--high": c.high || mix(c.text, c.bg, 16), "--mist": c.text, "--text": c.text,
    "--muted": c.muted || mix(c.text, c.bg, 60), "--amber": c.accent, "--coral": c.accent2, "--link": c.accent, "--url": c.accent2, "--sub": c.text,
    "--danger": c.danger || c.accent2, "--tab": c.tab || "", "--start-bg": c.startBg || "",
    "color-scheme": lum(c.bg) > 0.5 ? "light" : "dark",
  };
}
function applyCustom(root, theme, c, sys) {
  const full = c && c.light && typeof c.light === "object" && typeof matchMedia === "function" && !matchMedia("(prefers-color-scheme: dark)").matches ? Object.assign({}, c, c.light) : c;
  const ok = full && ["bg", "text", "accent", "accent2"].every((k) => /^#[0-9a-f]{6}$/i.test(full[k]));
  const vars = ok && theme === "custom" ? customVars(full) : null;
  const accent = !vars && theme === "system" && /^#[0-9a-f]{6}$/i.test(sys || "") ? sys : null;
  if (accent) { root.style.setProperty("--amber", accent); root.style.setProperty("--link", accent); }
  else if (!vars) { root.style.removeProperty("--amber"); root.style.removeProperty("--link"); }
  for (const k of ["--bg", "--raised", "--high", "--mist", "--text", "--muted", "--amber", "--coral", "--link", "--url", "--sub", "--danger", "--tab", "--start-bg", "color-scheme"]) {
    if (vars && vars[k] !== "") root.style.setProperty(k, vars[k]); else root.style.removeProperty(k);
  }
  const anim = vars && c && ["pulse", "glow", "drift", "float", "shimmer"].includes(c.anim) ? c.anim : "";
  if (anim) root.setAttribute("data-theme-anim", anim); else root.removeAttribute("data-theme-anim");
  // A light/dark theme re-applies itself when the system switches.
  root.__customArgs = [root, theme, c, sys];
  if (c && c.light && typeof matchMedia === "function" && !applyCustom.watching) {
    applyCustom.watching = true;
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { const a = root.__customArgs; if (a) applyCustom(...a); });
  }
}
