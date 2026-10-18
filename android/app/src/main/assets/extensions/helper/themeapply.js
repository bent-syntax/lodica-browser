// Maps the app palette onto the search page's CSS variables.
window.lodicaApplyTheme = function (t) {
  if (!t || typeof t !== "object") return;
  const hex = /^#[0-9a-fA-F]{6}$/, r = document.documentElement.style;
  const set = (name, v) => { if (hex.test(v)) r.setProperty(name, v); };
  set("--bg", t.bg); set("--raised", t.raised); set("--high", t.high); set("--text", t.text); set("--muted", t.muted);
  set("--amber", t.amber); set("--coral", t.coral); set("--link", t.amber); set("--url", t.amber); set("--body", t.text);
  r.setProperty("color-scheme", t.dark ? "dark" : "light");
};
