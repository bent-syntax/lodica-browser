// Runs before first paint: apply the last theme the app sent so the page never flashes the default palette.
(function () {
  try {
    const t = JSON.parse(localStorage.getItem("lodica.theme") || "null");
    if (t) window.lodicaApplyTheme(t);
  } catch (e) {}
})();
