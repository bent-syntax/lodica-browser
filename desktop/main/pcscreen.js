"use strict";
// Reverse remote control: this PC sends screen frames to the relay and applies input sent by the linked phone.
// Sharing requires the explicit "Allow phone control" setting. The user stops it by closing the panel.
const relay = require("./relay");

let deps = null, sharing = false, timer = 0, polling = false;

function init(d) { deps = d; }
const on = () => !!sharing;

async function upload() {
  if (!sharing || !deps) return;
  try {
    const wc = deps.tabs.wcOf();
    if (!wc || wc.isDestroyed()) return;
    const image = await wc.capturePage();
    const jpeg = image && image.toJPEG ? image.toJPEG(65) : null;
    if (!jpeg || !sharing) return;
    await relay.requestRaw("PUT", "/api/pcscreen", 15000, jpeg);
  } catch { /* a page can navigate while a frame is captured */ }
}

function keyEvent(type, key) {
  const map = { enter: "Return", escape: "Escape", tab: "Tab", space: " ", backspace: "Backspace", delete: "Delete", left: "Left", right: "Right", up: "Up", down: "Down" };
  return { type, key: map[key] || key, code: map[key] || key, windowsVirtualKeyCode: 0, nativeVirtualKeyCode: 0 };
}

async function apply(events) {
  if (!deps || !sharing) return;
  const wc = deps.tabs.wcOf();
  if (!wc || wc.isDestroyed()) return;
  const b = deps.ui.pageBounds();
  const pt = (x, y) => ({ x: Math.round(b.x + x * b.width), y: Math.round(b.y + y * b.height) });
  for (const e of events) {
    if (!e || !sharing || wc.isDestroyed()) break;
    try {
      if (e.t === "tap") {
        const p = pt(e.x, e.y);
        wc.sendInputEvent({ type: "mousePressed", ...p, button: "left", clickCount: 1 });
        wc.sendInputEvent({ type: "mouseReleased", ...p, button: "left", clickCount: 1 });
      } else if (e.t === "move") {
        wc.sendInputEvent({ type: "mouseMoved", ...pt(e.x2, e.y2) });
      } else if (e.t === "swipe") {
        const a = pt(e.x, e.y), z = pt(e.x2, e.y2);
        wc.sendInputEvent({ type: "mouseMoved", ...a });
        wc.sendInputEvent({ type: "mousePressed", ...a, button: "left", clickCount: 1 });
        wc.sendInputEvent({ type: "mouseMoved", ...z });
        wc.sendInputEvent({ type: "mouseReleased", ...z, button: "left", clickCount: 1 });
      } else if (e.t === "key") {
        if (e.key === "back") deps.tabs.back();
        else {
          wc.sendInputEvent(keyEvent("keyDown", e.key));
          wc.sendInputEvent(keyEvent("keyUp", e.key));
        }
      } else if (e.t === "text") wc.insertText(String(e.text).slice(0, 500));
    } catch { /* stale event during navigation */ }
  }
}

async function poll() {
  if (polling) return;
  polling = true;
  while (sharing && deps) {
    try {
      const [status, body] = await relay.request("GET", "/api/pcscreen/input?wait=20", 30000);
      if (!sharing) break;
      if (status === 200) {
        const data = JSON.parse(body || "{}");
        if (Array.isArray(data.events) && data.events.length) await apply(data.events);
      }
    } catch { /* relay offline: retry on the next loop */ }
  }
  polling = false;
}

async function start() {
  if (!deps || !deps.prefs.p.pcRemote || sharing) return false;
  sharing = true;
  deps.ui.setPanelWidth(360);
  deps.tabs.fit();
  upload();
  timer = setInterval(upload, 200);
  poll();
  return true;
}

async function stop() {
  if (!sharing) return false;
  sharing = false;
  clearInterval(timer); timer = 0;
  if (deps) { deps.ui.setPanelWidth(0); deps.tabs.fit(); }
  try { await relay.request("DELETE", "/api/pcscreen", 10000); } catch { /* already gone */ }
  return true;
}

module.exports = { init, start, stop, on, apply };
