"use strict";
// Phone screen: shows the screen of a linked phone that is sharing it (Android Settings > Server, chat & mail > Share phone screen).
// The phone sends frames through the relay; this page waits for each new one. Clicks, drags and the buttons on top control the phone
// (the phone needs the Lodica accessibility service switched on).
const PS = { L: null };

function openPhoneScreen() {
  if (PS.L) return PS.L;
  PS.L = openLayer({ key: "phonescreen", cls: "spage-layer", dim: false, onClose: () => { const L = PS.L; PS.L = null; L.dead = true; } }, (L) => {
    L.dead = false;
    L.status = h("div", { class: "empty", style: "padding:6px 12px", text: "Looking for your phone..." });
    L.img = h("img", { alt: "Phone screen", style: "display:none;max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;background:var(--raised)" });
    // Pointer on the picture: a short press is a tap, a drag is a swipe. Positions are sent as fractions of the picture.
    const at = (e) => { const r = L.img.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), t: Date.now() }; };
    let down = null;
    L.img.style.cursor = "pointer"; L.img.draggable = false; L.img.style.touchAction = "none";
    L.img.addEventListener("pointerdown", (e) => { e.preventDefault(); L.img.setPointerCapture(e.pointerId); down = at(e); });
    L.img.addEventListener("pointerup", (e) => {
      if (!down) return;
      const u = at(e), d = down; down = null;
      const far = Math.hypot(u.x - d.x, u.y - d.y) > 0.02;
      const ms = Math.min(1500, Math.max(50, u.t - d.t));
      inv("screen.input", [far ? { t: "swipe", x: d.x, y: d.y, x2: u.x, y2: u.y, ms } : { t: "tap", x: d.x, y: d.y, ms: Math.min(ms, 400) }]);
    });
    L.img.addEventListener("pointercancel", () => { down = null; });
    const key = (k, label, tip) => h("button", { class: "chip", text: label, title: tip, act: () => inv("screen.input", [{ t: "key", key: k }]) });
    L.box = h("div", { style: "flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 12px 12px" }, L.img);
    // Keeps one request open; the relay answers as soon as the phone sends the next frame.
    (async () => {
      let after = 0;
      while (!L.dead) {
        const r = await inv("screen.frame", after);
        if (L.dead) return;
        if (!r) { L.img.style.display = "none"; L.status.textContent = "Can't reach the server. Will try again."; await new Promise((ok) => setTimeout(ok, 3000)); continue; }
        if (r.idle) {
          // A relay that restarted counts frames from 1 again.
          after = 0;
          L.img.style.display = "none";
          L.status.textContent = "Your phone is not sharing its screen. On the phone open Settings > Server, chat & mail > Share phone screen.";
          await new Promise((ok) => setTimeout(ok, 2000));
          continue;
        }
        after = r.seq;
        L.img.src = r.img; L.img.style.display = "block";
        L.status.textContent = "Live from your phone";
      }
    })();
    return h("div", { class: "spage" },
      h("div", { class: "sp-main", style: "display:flex;flex-direction:column;height:100%" },
        h("div", { class: "sp-head" }, h("h2", { text: "Phone screen" }),
          h("button", { class: "chip", text: "Stop sharing", act: async () => { await inv("screen.stop"); L.close(); } }),
          ib("close", "Close phone screen", () => L.close())),
        h("div", { style: "display:flex;gap:8px;padding:0 12px 8px" }, key("back", "Back", "Phone back button"), key("home", "Home", "Phone home button"), key("recents", "Recent apps", "Phone recent apps"), key("notifications", "Notifications", "Pull down the notifications")),
        L.status, L.box));
  });
  return PS.L;
}
