"use strict";
// Phone -> PC remote control: this PC captures the entire OS screen (not a browser tab) with Electron desktopCapturer and
// applies the phone's taps, drags, scrolls, keys and text at OS level. Sharing requires the "Allow phone control" setting.
const relay = require("./relay");
const devices = require("./devices");
const osinput = require("./osinput");

let deps = null, sharing = false, timer = 0, polling = false, watcher = 0, capturing = false;
let target = "", inputApi = null;

function init(d) {
  deps = d;
  inputApi = osinput.create();
  // The phone can ask this desktop to start sharing from the "PC screen" page. Respect the desktop permission setting.
  if (!watcher) {
    watcher = setInterval(checkRequest, 2000);
    if (watcher.unref) watcher.unref();
  }
}
const on = () => !!sharing;
const getTarget = () => target || devices.target("android") || "";
function setTarget(value) { target = String(value || ""); return getTarget(); }

async function checkRequest() {
  if (!deps || sharing || !deps.relay || !deps.relay.available || !deps.prefs.p.pcRemote) return;
  try {
    const q = "/api/pcscreen/request?deviceId=" + encodeURIComponent(devices.id());
    const [status, body] = await relay.request("GET", q, 10000);
    if (status !== 200) return;
    const data = JSON.parse(body || "{}");
    const requests = Array.isArray(data.requests) ? data.requests : (data.pending ? [{}] : []);
    if (!requests.length) return;
    const from = String(requests[0].from || "");
    await relay.request("DELETE", q + (from ? "&from=" + encodeURIComponent(from) : ""), 10000);
    const fallback = devices.list("android")[0];
    await start(from || (fallback && fallback.id));
  } catch { /* relay offline: try again on the next tick */ }
}

/** Captures the whole OS display, not the current Lodica tab. */
async function captureFrame() {
  const { desktopCapturer } = require("electron");
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1600, height: 900 } });
  if (!sources.length) return null;
  const jpeg = sources[0].thumbnail.toJPEG(68);
  return jpeg && jpeg.length > 4 ? jpeg : null;
}

async function upload() {
  if (!sharing || !deps || capturing) return;
  capturing = true;
  try {
    const jpeg = await captureFrame();
    if (!jpeg || !sharing) return;
    await relay.requestRaw("PUT", "/api/pcscreen?deviceId=" + encodeURIComponent(getTarget()), 15000, jpeg);
  } catch { /* a display can disappears while it is captured */ }
  finally { capturing = false; }
}

async function apply(events) {
  if (!deps || !sharing || !inputApi) return 0;
  return inputApi.apply(events);
}

async function poll() {
  if (polling) return;
  polling = true;
  while (sharing && deps) {
    try {
      const q = "/api/pcscreen/input?deviceId=" + encodeURIComponent(devices.id()) + "&wait=20";
      const [status, body] = await relay.request("GET", q, 30000);
      if (!sharing) break;
      if (status === 200) {
        const data = JSON.parse(body || "{}");
        if (Array.isArray(data.events) && data.events.length) await apply(data.events);
      }
    } catch { /* relay offline: retry on the next loop */ }
  }
  polling = false;
}

async function start(phoneId) {
  if (!deps || !deps.prefs.p.pcRemote || sharing) return false;
  setTarget(phoneId);
  if (!getTarget()) return false;
  sharing = true;
  // The renderer owns the docked controller panel; never reserve the AI panel's BrowserView here.
  upload();
  timer = setInterval(upload, 200);
  poll();
  return true;
}

async function stop() {
  if (!sharing) return false;
  sharing = false;
  clearInterval(timer); timer = 0;
  try { await relay.request("DELETE", "/api/pcscreen?deviceId=" + encodeURIComponent(getTarget()), 10000); } catch { /* already gone */ }
  return true;
}

module.exports = { init, start, stop, on, apply, checkRequest, target: getTarget, setTarget };
