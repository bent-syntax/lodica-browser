// Runs before the page paints: with force dark on, the page starts dark so a white page never flashes
// on back, forward or a fresh load. content.js removes this style once the real remap has taken over.
(function () {
  if (window !== window.top) return;
  browser.storage.local.get("page").then((r) => {
    if (!r.page || !r.page.dark || document.getElementById("lodica-predark")) return;
    const st = document.createElement("style");
    st.id = "lodica-predark";
    st.textContent = "html{background:#111827!important;color-scheme:dark!important}";
    (document.head || document.documentElement).appendChild(st);
  }, () => {});
})();
