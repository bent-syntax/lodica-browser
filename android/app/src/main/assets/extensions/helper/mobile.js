"use strict";

// Pages built only for desktop have no viewport tag, so a phone draws them 980 px wide and zoomed out.
// Give those pages a device-width viewport so they reflow to the screen. Pages that set their own
// viewport are left alone, and so are tabs switched to the desktop site (their user agent is not mobile).
(() => {
  if (window !== window.top) return;
  if (!/Android.*Mobile|Mobile.*Android/i.test(navigator.userAgent)) return;
  const apply = () => {
    if (document.querySelector('meta[name="viewport" i]')) return;
    const head = document.head || document.documentElement;
    if (!head) return;
    const m = document.createElement("meta");
    m.name = "viewport";
    m.content = "width=device-width, initial-scale=1";
    head.appendChild(m);
    const s = document.createElement("style");
    s.textContent = "img,video,canvas,svg{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-x:auto}";
    head.appendChild(s);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, { once: true });
  else apply();
})();
