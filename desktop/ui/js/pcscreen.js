"use strict";
// Side panel that starts/stops sending this PC's screen to the linked phone.
function openPcScreen() {
  if (S.mode !== "main") { exitEdit(); closeFind(); }
  return openLayer({ key: "pcscreen", cls: "pc-panel-layer", dim: false, onClose: () => { inv("pcscreen.stop"); } }, (L) => {
    const img = h("img", { class: "pc-hint-img", src: "logo.png", alt: "Lodica" });
    const box = h("div", { class: "pc-panel" },
      img,
      h("h2", { text: "Phone controls this PC" }),
      h("p", { class: "muted", text: "Your screen is shown on the linked phone. Tap, swipe or type there to control this page. Close this panel to stop sharing." }),
      h("p", { class: "muted", text: "Turn on “Allow phone to control this PC” in Settings → Linked devices first." }),
      btn("Stop sharing", () => L.close(), "muted"));
    inv("pcscreen.start").then((ok) => { if (!ok) { toast("Turn on phone control in Settings first"); L.close(); } }).catch(() => { toast("Could not start sharing"); L.close(); });
    return box;
  });
}
