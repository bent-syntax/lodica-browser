// Runs before first paint: apply the theme the app put in the URL, else the last one it sent.
(function () {
  try {
    let t = null;
    const v = (new URLSearchParams(location.search).get("th") || "").split(",");
    if (v.length === 8 && v.slice(0, 7).every((x) => /^[0-9a-fA-F]{6}$/.test(x))) {
      const c = v.map((x) => "#" + x);
      t = { dark: v[7] === "d", bg: c[0], raised: c[1], high: c[2], text: c[3], muted: c[4], amber: c[5], coral: c[6] };
      localStorage.setItem("lodica.theme", JSON.stringify(t));
    } else t = JSON.parse(localStorage.getItem("lodica.theme") || "null");
    if (t) window.lodicaApplyTheme(t);
  } catch (e) {}
})();
