"use strict";
// Dedicated docked controller for sending this PC's screen to the linked phone.
// The permission itself is a clean setting in Settings -> Link; this panel only starts and stops the stream.
const PC = { L: null };

function closePcScreen() { if (PC.L) PC.L.close(); }

function openPcScreen() {
  if (S.mode !== "main") { exitEdit(); closeFind(); }
  if (PC.L) return PC.L;
  // The AI panel is a separate view on the right. Close it so the two never sit on top of each other.
  inv("ai.panel.close");
  inv("ui.dock", 360);
  PC.L = openLayer({
    key: "pcscreen", cls: "spage-layer settings-tab nb-dock pc-dock", dim: false,
    onClose: () => { inv("pcscreen.stop"); inv("ui.dock", 0); PC.L = null; },
  }, (L) => {
    L.status = h("div", { class: "empty", style: "padding:6px 12px", text: "Starting the screen stream…" });
    const hint = h("p", { class: "muted", style: "padding:0 12px 8px", text: "The linked phone can watch this page and send taps, keys and typed text. Close this panel to stop sharing." });
    const settings = h("button", { class: "chip", text: "Permission in Settings", act: () => openSettings("link") });
    const stop = h("button", { class: "chip", text: "Stop sharing", act: () => L.close() });
    inv("pcscreen.start").then((ok) => {
      if (L.closed) return;
      if (!ok) { L.close(); toast("Turn on “Allow phone to control this PC” in Settings first"); return; }
      L.status.textContent = "Sharing this screen with the linked phone";
    }).catch(() => { if (!L.closed) L.status.textContent = "Could not reach the server. Close and reopen this panel to retry."; });
    return h("div", { class: "spage" },
      h("div", { class: "sp-main", style: "display:flex;flex-direction:column;height:100%" },
        h("div", { class: "sp-head" }, h("h2", { text: "Phone controls this PC" }), ib("close", "Close controller", () => L.close())),
        L.status, hint,
        h("div", { class: "phone-keys", style: "margin-top:auto" }, settings, stop)));
  });
  return PC.L;
}
