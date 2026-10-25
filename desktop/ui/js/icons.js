"use strict";
// Outline 24px glyphs (1.8 stroke, round caps and joins, stroke = currentColor) and the Lodica kite.
const ICONS = {
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z",
  palette: "M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4-4-8-9-8zM6.9 11a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0zM9.4 7.5a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0zM13.9 7.5a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0z",
  tabs: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9.5h18M10 5v4.5",
  back: "M19 12H5M11 5l-7 7 7 7",
  forward: "M5 12h14M13 5l7 7-7 7",
  reload: "M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5",
  close: "M6 6l12 12M18 6L6 18",
  share: "M12 15V3M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7",
  add: "M12 5v14M5 12h14",
  more: "M11.4 5a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0zM11.4 12a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0zM11.4 19a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0z",
  search: "M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0zM20.5 20.5 16 16",
  lock: "M6 11h12a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3",
  warning: "M12 3.5 2.5 20h19zM12 10v4.5M12 17.5v.01",
  globe: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  shield: "M12 3 5 6v5.5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z",
  shieldOff: "M5 6v5.5c0 4.4 3 8.3 7 9.5 1.6-.5 3-1.4 4.2-2.7M9 4.4 12 3l7 3v5.5c0 1.2-.2 2.3-.6 3.4M3 3l18 18",
  vpn: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 16a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 8v.01M8 17v.01",
  private: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4 4l16 16",
  find: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9.3 13.5a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0zM13.2 15.2 15 17",
  desktop: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 21h8M12 17v4",
  phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
  download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14",
  serial: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM7 10l3 2-3 2M12.5 15h4.5",
  history: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8M12 7.5V12l3 2",
  key: "M4 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0zM11 12l9-9M16 7l3 3M14 9l2 2",
  settings: "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  email: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6.5L21 7",
  inbox: "M3 13l3-8h12l3 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 13h5a4 4 0 0 0 8 0h5",
  reader: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9h8M8 12.5h8M8 16h5",
  lite: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  alarm: "M4.5 13a7.5 7.5 0 1 0 15.0 0a7.5 7.5 0 1 0 -15.0 0zM12 9v4l2.5 1.5M4 5 7 3M20 5l-3-2",
  compat: "M14.5 6.5a4 4 0 0 0-5.2 5.2L3.5 17.5a2 2 0 0 0 3 3l5.8-5.8a4 4 0 0 0 5.2-5.2l-2.5 2.5-2.3-.6-.6-2.3z",
  install: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM12 8v6M9.5 11.5 12 14l2.5-2.5",
  speed: "M4 18a9 9 0 1 1 16 0M12 14l4-5M12 14v.01",
  hd: "M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 9v6M8 12h3M11 9v6M14 9h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2z",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  archive: "M4 4h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4",
  unarchive: "M4 4h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M12 17v-6M9.5 13.5 12 11l2.5 2.5",
  delete: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  ai: "M10 4l1.8 4.7L16.5 10.5l-4.7 1.8L10 17l-1.8-4.7L3.5 10.5l4.7-1.8zM18 3v4M16 5h4M18 15v4M16 17h4",
  up: "M6 15l6-6 6 6",
  smile: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5v.01M15 9.5v.01",
  clip: "M20 11.5 11.5 20a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.4-2.4l8-8",
  down: "M6 9l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  open: "M14 4h6v6M20 4 11 13M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  preview: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  folder: "M3 6a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  pause: "M8 5v14M16 5v14",
  play: "M7 4.5v15l12-7.5z",
  volume: "M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11",
  chevron: "M9 6l6 6-6 6",
  apps: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  data: "M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z",
  image: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM7.5 9a1.5 1.5 0 1 0 3.0 0a1.5 1.5 0 1 0 -3.0 0zM20 15l-4.5-4.5L6 20",
};

const SVGNS = "http://www.w3.org/2000/svg";
function ico(name, cls) {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "ico" + (cls ? " " + cls : ""));
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", ICONS[name] || ICONS.globe);
  p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "1.8");
  p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
  s.append(p);
  return s;
}

// The Lodica mark: body follows the text colour, the middle bar the accent, so it recolours with the theme.
function kite(size) {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "20 8 70 90");
  s.setAttribute("width", size); s.setAttribute("height", size);
  s.setAttribute("class", "kite");
  s.innerHTML = `<path d="M28,8 H40 Q44,8 46.5,12 L49,16 L46.5,20 Q44,24 40,24 H28 A8,8 0 0 1 28,8 Z M28,32 H40 A8,8 0 0 1 40,48 H28 A8,8 0 0 1 28,32 Z M28,80 H54 A8,8 0 0 1 54,96 H28 A8,8 0 0 1 28,80 Z M77,68.5 C84.5,68.5 89,79 89,86.5 C89,92.5 84,96 77,96 C70,96 65,92.5 65,86.5 C65,79 69.5,68.5 77,68.5 Z" style="fill:var(--text,#E5E7EB)"/><path d="M28,56 H44 A8,8 0 0 1 44,72 H28 A8,8 0 0 1 28,56 Z" style="fill:var(--amber,#F59E0B)"/>`;
  return s;
}
