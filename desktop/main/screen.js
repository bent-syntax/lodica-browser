// Live view and control of a linked phone. The desktop captures the full Android screen with ADB `screencap -p`, converts each
// PNG to JPEG and uploads it to the phone's relay channel; taps, swipes, text and keys go back through ADB `input`.
const relay = require("./relay");
const adb = require("./adb");
const devices = require("./devices");

let timer = 0, running = false, current = "", capturing = false;
let size = null;

function runner() { return adb.create(undefined, (png) => {
  const { nativeImage } = require("electron");
  return nativeImage.createFromBuffer(png).toJPEG(70);
}); }

function setTarget(value) {
  const chosen = adb.cleanId(value) || devices.target("android") || "";
  if (chosen && chosen !== current) size = null;
  current = chosen;
  return current;
}
const getTarget = () => current || devices.target("android") || "";

async function ensureSerial(api) {
  let serial = adb.serialFor(getTarget());
  if (serial) return serial;
  const list = (await api.devices()).filter((d) => d.online);
  if (list.length === 1) {
    // A single USB/Wireless ADB device is almost certainly the selected phone; remember the association.
    serial = list[0].serial;
    adb.pairSerial(getTarget(), serial);
    return serial;
  }
  return "";
}

async function upload() {
  if (!running || capturing) return;
  capturing = true;
  try {
    const target = getTarget();
    if (!target) return;
    const api = runner();
    const serial = await ensureSerial(api);
    if (!serial) return;
    const jpeg = await api.frame(serial);
    if (!jpeg || !running || target !== getTarget()) return;
    await relay.requestRaw("PUT", "/api/screen?deviceId=" + encodeURIComponent(target), 15000, jpeg);
  } catch { /* no device, asleep or relay offline: try again on the next tick */ }
  finally { capturing = false; }
}

/** Starts the ADB frame loop for a linked phone. Called when the docked controller opens or the target changes. */
async function start(target) {
  setTarget(target);
  if (!getTarget()) return false;
  if (running) return true;
  running = true;
  // A phone paired once reconnects itself; no address entry is needed on later launches. Wait briefly so the first frame can use it.
  try {
    await Promise.race([adb.create().autoConnect(), new Promise((ok) => setTimeout(ok, 1500))]);
  } catch {}
  const api = runner();
  try { const serial = await ensureSerial(api); if (serial) size = await api.size(serial).catch(() => null); } catch {}
  upload();
  timer = setInterval(upload, 160);
  if (timer.unref) timer.unref();
  return true;
}

/**
 * Waits up to 20 seconds for a frame newer than `after`.
 * Resolves { seq, img } (img is a data URL), { idle: true } when nobody is sharing, or null when the relay cannot answer.
 */
async function frame(after, target) {
  if (target) setTarget(target);
  if (!running) start(getTarget());
  try {
    const q = "?deviceId=" + encodeURIComponent(getTarget()) + "&after=" + (Number(after) || 0) + "&wait=20";
    const [status, body, seq] = await relay.requestRawSeq("GET", "/api/screen" + q, 30000);
    if (status === 204) return { idle: true };
    if (status !== 200) return null;
    return { seq: Number(seq) || 0, img: "data:image/jpeg;base64," + body.toString("base64") };
  } catch { return null; }
}

/** Stops the share on the relay, so the phone stops sending. */
async function stop(target) {
  if (target) setTarget(target);
  running = false;
  clearInterval(timer); timer = 0;
  try { await relay.request("DELETE", "/api/screen?deviceId=" + encodeURIComponent(getTarget()), 15000); return true; } catch { return false; }
}

/** Sends input events (taps, swipes, keys, text; coordinates are fractions of the screen) to the phone. */
async function input(events, target) {
  if (target) setTarget(target);
  if (!Array.isArray(events) || !events.length) return false;
  const serial = adb.serialFor(getTarget());
  let local = false;
  if (serial) {
    try {
      const api = runner();
      for (const e of events) if (await api.input(serial, e, size)) local = true;
    } catch { /* fall through to the relay/Miracast path */ }
  }
  try {
    const [status] = await relay.request("POST", "/api/screen/input", 5000, { deviceId: getTarget(), events });
    return status === 200 || local;
  } catch { return local; }
}

/** Types into the field that currently has focus on the phone. */
async function text(value, target) {
  const s = typeof value === "string" ? value.slice(0, 500) : "";
  if (!s) return false;
  return input([{ t: "text", text: s }], target);
}

async function adbDevices() {
  try {
    const live = await runner().devices();
    const bySerial = new Map(live.map((d) => [d.serial, d]));
    // Paired phones stay in the list even while asleep/offline, so a remembered device can always be selected.
    for (const p of adb.pairedList()) if (!bySerial.has(p.serial)) bySerial.set(p.serial, {
      serial: p.serial, model: p.name || p.serial, state: "offline", online: false, paired: true,
    });
    return { devices: [...bySerial.values()], paired: adb.serialFor(getTarget()), error: "" };
  } catch (e) {
    const devices = adb.pairedList().map((p) => ({ serial: p.serial, model: p.name || p.serial, state: "offline", online: false, paired: true }));
    return { devices, paired: adb.serialFor(getTarget()), error: String(e && e.message || e).slice(0, 300) };
  }
}
async function adbConnect(address) {
  const r = await runner().connect(address);
  if (r && r.ok) {
    const existing = adb.pairedList().find((p) => p.serial === address);
    adb.rememberPaired(address, existing && existing.name);
    return { ...r, serial: address };
  }
  return r;
}
function adbPair(serial) {
  if (!getTarget()) return false;
  const ok = adb.pairSerial(getTarget(), serial);
  if (ok) { adb.rememberPaired(serial); size = null; }
  return ok;
}
async function adbPairWireless(address, code, connectionAddress) {
  if (!getTarget()) return { ok: false, error: "Link a phone first" };
  const r = await runner().pairWireless(address, code, connectionAddress);
  if (r && r.ok) {
    adb.pairSerial(getTarget(), r.serial);
    adb.rememberPaired(r.serial, r.model);
    size = null;
  }
  return r;
}
async function adbSelect(serial) {
  const s = adb.cleanSerial(serial);
  if (!s || !getTarget()) return { ok: false, error: "Link a phone first" };
  adb.pairSerial(getTarget(), s);
  const conn = adb.isWirelessSerial(s) ? await adb.create().connectSerial(s) : { ok: true };
  size = null;
  return { ok: !!conn.ok, error: conn.error || "", serial: s };
}
function adbForget(serial) { return adb.forgetPaired(serial); }

module.exports = {
  frame, stop, input, text, start, target: getTarget, setTarget,
  adbDevices, adbConnect, adbPair, adbPairWireless, adbSelect, adbForget,
};
