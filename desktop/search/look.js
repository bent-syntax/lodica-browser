"use strict";
// Applies the theme and the start page background. The last look is cached so the first paint already has it.
(function () {
  const KEY = "lodica.look";
  const root = document.documentElement;

  function image(b) {
    const v = String(b.value || "");
    if (b.type === "gradient") { const g = BGS.gradients.find((x) => x[0] === v); return g ? g[2] : ""; }
    if (b.type === "image") return BGS.images.some((x) => x[0] === v) ? 'url("bg/' + v + '.svg")' : "";
    if (b.type === "custom") return /^[\w.-]+$/.test(v) ? 'url("_bg/' + v + '")' : "";
    if (b.type === "color") return /^#[0-9a-f]{6}$/i.test(v) ? "linear-gradient(" + v + "," + v + ")" : "";
    return "";
  }

  function apply(look) {
    const l = look || {}, b = l.bg || {};
    root.dataset.theme = l.theme || "system";
    applyCustom(root, l.theme, l.custom);
    const img = image(b);
    root.classList.toggle("hasbg", !!img);
    root.style.setProperty("--bgimg", img || "none");
    root.style.setProperty("--bgdim", Math.min(100, Math.max(0, +b.dim || 0)) + "%");
    root.style.setProperty("--bgblur", Math.min(40, Math.max(0, +b.blur || 0)) + "px");
  }

  try { apply(JSON.parse(localStorage.getItem(KEY))); } catch { apply(null); }
  if (typeof browser === "undefined") return;
  browser.runtime.sendMessage({ type: "state" }).then((s) => {
    if (!s) return;
    const look = { theme: s.theme, custom: s.custom, bg: s.bg };
    apply(look);
    try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* storage unavailable */ }
  }, () => {});
})();
