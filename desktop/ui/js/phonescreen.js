"use strict";
// Phone screen: shows the full Android screen of a linked phone, captured by ADB on the desktop and relayed to this panel.
// The panel stays docked in portrait and rotates to landscape in fullscreen. Taps, drags, text and keys go back through ADB.
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
    L.target = "";
    L.status = h("div", { class: "empty", style: "padding:6px 12px", text: "Looking for your phone..." });
    L.img = h("img", { alt: "Phone screen", class: "phone-img" });
    const send = (events) => inv("screen.input", events, L.target);
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
      send(far ? [{ t: "swipe", x: d.x, y: d.y, x2: u.x, y2: u.y, ms }] : [{ t: "tap", x: d.x, y: d.y, ms: Math.min(ms, 400) }]);
    });
    L.img.addEventListener("pointercancel", () => { down = null; });
    L.img.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const p = at(e);
      if (p) send([{ t: "right", x: p.x, y: p.y }]);
    });
    L.img.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = at(e);
      if (p) send([{ t: "scroll", x: p.x, y: p.y, steps: e.deltaY > 0 ? 1 : -1 }]);
    }, { passive: false });
    const key = (k, label, tip) => h("button", { class: "chip", text: label, title: tip, act: () => send([{ t: "key", key: k }]) });
    L.text = h("input", { class: "field", maxlength: "500", placeholder: "Type on the phone", autocomplete: "off" });
    const sendText = async () => {
      const v = L.text.value;
      if (!v.trim()) return;
      const ok = await inv("screen.text", v, L.target);
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

    // Linked device picker. Multiple phones can be linked; the selected id routes every frame and input event.
    L.picker = h("div", { class: "remote-targets" });
    const renderTargets = async () => {
      if (L.dead) return;
      const list = await inv("devices.list", "android") || [];
      clear(L.picker);
      if (!list.length) L.picker.append(h("span", { class: "muted", text: "No linked phones yet" }));
      for (const d of list) L.picker.append(h("button", {
        class: "chip" + (d.selected ? " sel" : ""),
        text: d.name + (d.online ? "" : " (offline)"),
        act: async () => {
          await inv("devices.setTarget", "android", d.id);
          L.target = await inv("devices.target", "android") || d.id;
          renderTargets();
          await inv("screen.stop", L.target);
          await inv("screen.start", L.target);
          after = 0;
        },
      }));
    };
    renderTargets();

    // ADB: pair once with the phone's six-digit wireless code. That phone is remembered and reconnects itself later.
    L.adb = h("div", { class: "remote-adb" });
    const chooseAdb = async (serial) => {
      const r = await inv("adb.select", serial);
      if (!r || !r.ok) { toast(r && r.error || "Could not select that phone"); return false; }
      L.target = await inv("devices.target", "android") || L.target;
      renderTargets();
      after = 0;
      refreshAdb();
      return true;
    };
    const refreshAdb = async () => {
      if (L.dead) return;
      const r = await inv("adb.devices") || {};
      clear(L.adb);
      const list = r.devices || [];
      L.adb.append(h("span", { class: "muted", text: r.error || (list.length ? "Paired devices" : "No paired devices yet") }));
      for (const dev of list) {
        const row = h("div", { class: "adb-device" });
        row.append(h("button", {
          class: "chip" + (r.paired === dev.serial ? " sel" : ""),
          text: (dev.model || dev.serial) + (dev.online ? "" : " (" + (dev.state || "offline") + ")"),
          act: () => chooseAdb(dev.serial),
        }));
        row.append(h("button", { class: "ib", title: "Forget this phone", text: "✕", act: async () => { await inv("adb.forget", dev.serial); refreshAdb(); } }));
        L.adb.append(row);
      }
    };
    L.adbAddress = h("input", { class: "field", placeholder: "Pairing address 192.168.1.20:4444", "aria-label": "Wireless pairing address" });
    L.adbCode = h("input", { class: "field", placeholder: "Code (6 digits)", "aria-label": "Wireless pairing code", maxlength: "6", inputmode: "numeric", autocomplete: "one-time-code" });
    L.adbConnectAddress = h("input", { class: "field", placeholder: "Connection address (if needed)", "aria-label": "Wireless connection address" });
    const adbPairWireless = async () => {
      const r = await inv("adb.pairWireless", L.adbAddress.value, L.adbCode.value, L.adbConnectAddress.value);
      toast(r && r.ok ? "Paired. Select this phone any time." : (r && (r.error || r.output)) || "Could not pair");
      if (r && r.ok) {
        L.adbAddress.value = ""; L.adbCode.value = ""; L.adbConnectAddress.value = "";
        await chooseAdb(r.serial);
      } else refreshAdb();
    };
    const adbConnect = async () => {
      const r = await inv("adb.connect", L.adbConnectAddress.value);
      toast(r && r.ok ? "Connected" : (r && (r.error || r.output)) || "Could not connect");
      if (r && r.ok) { L.adbConnectAddress.value = ""; await chooseAdb(r.serial); }
    };
    L.adbCode.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); adbPairWireless(); } });
    L.adbConnectAddress.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); adbConnect(); } });
    refreshAdb();

    L.frame = h("div", { class: "phone-frame" }, h("div", { class: "phone-frame-box" }, L.img));
    // Keeps one request open; the relay answers as soon as the phone sends the next frame.
    let after = 0;
    (async () => {
      L.target = await inv("devices.target", "android") || "";
      await inv("screen.start", L.target);
      while (!L.dead) {
        const r = await inv("screen.frame", after, L.target);
        if (L.dead) return;
        if (!r) { L.img.style.display = "none"; L.status.textContent = "Can't reach the server. Will try again."; await new Promise((ok) => setTimeout(ok, 3000)); continue; }
        if (r.idle) {
          // A relay that restarted counts frames from 1 again.
          after = 0;
          L.img.style.display = "none";
          L.status.textContent = "Connect the phone with USB/Wireless ADB, or start sharing in Settings on the phone.";
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
          h("button", { class: "chip", text: "Stop sharing", act: async () => { await inv("screen.stop", L.target); L.close(); } }),
          ib("close", "Close phone screen", () => L.close())),
        h("div", { class: "remote-targets-wrap" }, h("span", { class: "muted", text: "Control phone:" }), L.picker),
        h("div", { class: "remote-adb-wrap" }, h("span", { class: "muted", text: "ADB:" }), L.adb,
          h("div", { class: "muted adb-hint", text: "On the phone: Developer options → Wireless debugging → Pair device using pairing code. Pair once; it reconnects itself after that." }),
          h("div", { class: "remote-adb-connect" }, L.adbAddress, L.adbCode, h("button", { class: "chip", text: "Pair", act: adbPairWireless })),
          h("div", { class: "remote-adb-connect" }, L.adbConnectAddress, h("button", { class: "chip", text: "Connect", act: adbConnect }))),
        h("div", { class: "phone-keys" }, key("back", "Back", "Phone back button"), key("home", "Home", "Phone home button"), key("recents", "Recent apps", "Phone recent apps"), key("notifications", "Notifications", "Pull down the notifications")),
        L.status, L.frame,
        h("div", { class: "phone-send" }, L.text, h("button", { class: "chip", text: "Send", act: sendText }))));
  });
  return PS.L;
}

if (typeof module !== "undefined" && module.exports) module.exports = { phonePointer, phoneContent };
