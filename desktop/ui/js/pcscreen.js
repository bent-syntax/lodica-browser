"use strict";
// Dedicated docked controller for sending this PC's full OS screen to a linked phone.
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
    const hint = h("p", { class: "muted", style: "padding:0 12px 8px", text: "The selected phone can watch the whole desktop and send taps, keys and typed text. Close this panel to stop sharing." });
    const settings = h("button", { class: "chip", text: "Permission in Settings", act: () => openSettings("link") });
    const stop = h("button", { class: "chip", text: "Stop sharing", act: () => L.close() });
    L.picker = h("div", { class: "remote-targets" });
    const renderTargets = async () => {
      if (L.closed) return;
      const list = await inv("devices.list", "android") || [];
      clear(L.picker);
      if (!list.length) L.picker.append(h("span", { class: "muted", text: "No linked phones yet" }));
      for (const d of list) L.picker.append(h("button", {
        class: "chip" + (d.selected ? " sel" : ""),
        text: d.name + (d.online ? "" : " (offline)"),
        act: async () => {
          await inv("devices.setTarget", "android", d.id);
          await inv("pcscreen.stop");
          renderTargets();
          const ok = await inv("pcscreen.start", d.id);
          if (L.closed) return;
          L.status.textContent = ok ? "Sharing the whole desktop with " + d.name : "Could not start sharing";
        },
      }));
    };
    renderTargets();
    inv("pcscreen.target").then(async (current) => {
      if (L.closed) return;
      const ok = await inv("pcscreen.start", current);
      if (L.closed) return;
      if (!ok) { L.close(); toast("Turn on “Allow phone to control this PC” in Settings first"); return; }
      L.status.textContent = "Sharing this screen with the linked phone";
    }).catch(() => { if (!L.closed) L.status.textContent = "Could not reach the server. Close and reopen this panel to retry."; });
    return h("div", { class: "spage" },
      h("div", { class: "sp-main", style: "display:flex;flex-direction:column;height:100%" },
        h("div", { class: "sp-head" }, h("h2", { text: "Phone controls this PC" }), ib("close", "Close controller", () => L.close())),
        h("div", { class: "remote-targets-wrap" }, h("span", { class: "muted", text: "Share with:" }), L.picker),
        L.status, hint,
        h("div", { class: "phone-keys", style: "margin-top:auto" }, settings, stop)));
  });
  return PC.L;
}
