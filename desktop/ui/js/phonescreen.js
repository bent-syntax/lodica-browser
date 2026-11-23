"use strict";
// Phone screen: shows the screen of a linked phone that is sharing it (Android Settings > Server, chat & mail > Share phone screen).
// The phone sends frames through the relay; this page waits for each new one. Clicks, drags and the buttons on top control the phone
// (the phone needs the Lodica accessibility service switched on).
const PS = { L: null };

/**
 * Pure pointer helpers. `phonePointer` converts a fraction of the *displayed* picture to a fraction of the
 * captured portrait frame. `phoneContent` finds the real picture inside an object-fit:contain box (also after a 90° CSS rotation),
 * so taps do not drift when the captured aspect differs from the 9/16 viewport.
 */
function phonePointer(x, y, rotated) {
  const c = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  x = c(x); y = c(y);
  // CSS rotate(90deg) maps original (u,v) to displayed (1-v,u); invert that.
  return rotated ? { x: y, y: 1 - x } : { x, y };
}

function phoneContent(box, nw, nh, rotated) {
  if (!box || !box.width || !box.height || !nw || !nh) return null;
  // getBoundingClientRect() is already axis-aligned after a 90° rotation, so the unrotated layout box is swapped.
  const ow = rotated ? box.height : box.width;
  const oh = rotated ? box.width : box.height;
  const scale = Math.min(ow / nw, oh / nh);
  const cw = nw * scale, ch = nh * scale;
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  return rotated
    ? { left: cx - ch / 2, top: cy - cw / 2, width: ch, height: cw }
    : { left: cx - cw / 2, top: cy - ch / 2, width: cw, height: ch };
}

function openPhoneScreen() {
  if (PS.L) return PS.L;
  // A separate BrowserView hosts the AI panel; close it so the docked video cannot bleed into the chat.
  inv("ai.panel.close");
  // Dock right like the notebook so the page shrinks instead of being covered.
  inv("ui.dock", 360);
  PS.L = openLayer({ key: "phonescreen", cls: "spage-layer settings-tab nb-dock phone-dock", dim: false, onClose: () => { inv("ui.dock", 0); const L = PS.L; PS.L = null; L.dead = true; } }, (L) => {
    L.dead = false;
    L.rotated = false;
    L.status = h("div", { class: "empty", style: "padding:6px 12px", text: "Looking for your phone..." });
    L.img = h("img", { alt: "Phone screen", class: "phone-img" });
    // Pointer on the picture: a short press is a tap, a drag is a swipe. Positions are sent as fractions of the captured frame.
    const at = (e) => {
      const box = phoneContent(L.img.getBoundingClientRect(), L.img.naturalWidth, L.img.naturalHeight, L.rotated);
      if (!box) return null;
      const p = phonePointer((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height, L.rotated);
      return { x: p.x, y: p.y, t: Date.now() };
    };
    let down = null;
    L.img.draggable = false;
    L.img.addEventListener("pointerdown", (e) => {
      const p = at(e); if (!p) return;
      e.preventDefault(); L.img.setPointerCapture(e.pointerId); down = p;
    });
    L.img.addEventListener("pointerup", (e) => {
      if (!down) return;
      const u = at(e), d = down; down = null;
      if (!u) return;
      const far = Math.hypot(u.x - d.x, u.y - d.y) > 0.02;
      const ms = Math.min(1500, Math.max(50, u.t - d.t));
      inv("screen.input", [far ? { t: "swipe", x: d.x, y: d.y, x2: u.x, y2: u.y, ms } : { t: "tap", x: d.x, y: d.y, ms: Math.min(ms, 400) }]);
    });
    L.img.addEventListener("pointercancel", () => { down = null; });
    const key = (k, label, tip) => h("button", { class: "chip", text: label, title: tip, act: () => inv("screen.input", [{ t: "key", key: k }]) });
    L.text = h("input", { class: "field", maxlength: "500", placeholder: "Type on the phone", autocomplete: "off" });
    const sendText = async () => {
      const v = L.text.value;
      if (!v.trim()) return;
      const ok = await inv("screen.text", v);
      if (ok) L.text.value = "";
      else toast("Couldn't send text to your phone");
      L.text.focus();
    };
    L.text.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendText(); } });
    const setFull = (on) => {
      L.rotated = on;
      L.el.classList.toggle("phone-full", on);
      inv("ui.dock", on ? 0 : 360);
      const label = on ? "Back to docked view" : "Fullscreen landscape";
      L.expand.title = label;
      L.expand.setAttribute("aria-label", label);
    };
    L.expand = ib("expand", "Fullscreen landscape", () => setFull(!L.rotated));
    L.frame = h("div", { class: "phone-frame" }, h("div", { class: "phone-frame-box" }, L.img));
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
          L.expand,
          h("button", { class: "chip", text: "Stop sharing", act: async () => { await inv("screen.stop"); L.close(); } }),
          ib("close", "Close phone screen", () => L.close())),
        h("div", { class: "phone-keys" }, key("back", "Back", "Phone back button"), key("home", "Home", "Phone home button"), key("recents", "Recent apps", "Phone recent apps"), key("notifications", "Notifications", "Pull down the notifications")),
        L.status, L.frame,
        h("div", { class: "phone-send" }, L.text, h("button", { class: "chip", text: "Send", act: sendText }))));
  });
  return PS.L;
}

if (typeof module !== "undefined" && module.exports) module.exports = { phonePointer, phoneContent };
