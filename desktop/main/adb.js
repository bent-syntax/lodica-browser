"use strict";
// ADB bridge for the desktop phone controller. ADB commands are wrapped in an injectable runner so the pure parsing and
// command building can be tested on machines without a phone or the Android SDK.
const { execFile } = require("child_process");
const store = require("./store");

const KEY = {
  back: 4, home: 3, recents: 187, notifications: 83,
  enter: 66, escape: 111, tab: 61, space: 62, backspace: 67, delete: 112,
  left: 21, right: 22, up: 19, down: 20,
};

const defaultRunner = (args, options) => new Promise((resolve, reject) => {
  execFile("adb", args, { maxBuffer: 12 * 1024 * 1024, encoding: "buffer", ...options }, (err, stdout, stderr) => {
    if (err) return reject(err);
    resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || ""));
  });
});

/** `adb devices -l` -> [{ serial, model, state, online }]. */
function parseDevices(text) {
  return String(text || "").split(/\r?\n/).slice(1).map((line) => {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const serial = parts[0];
    const state = parts[1] || "offline";
    const modelField = parts.slice(2).find((p) => p.startsWith("model:"));
    return { serial, model: modelField ? modelField.slice(6) : "", state, online: state === "device" };
  }).filter(Boolean);
}

/** Only host:port addresses are accepted, and the port must fit in a TCP port. */
function cleanAddress(value) {
  const s = String(value == null ? "" : value).trim();
  const m = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(s);
  if (!m) return "";
  const octets = m[1].split(".").map(Number);
  if (octets.some((n) => n > 255)) return "";
  const port = Number(m[2]);
  return port > 0 && port <= 65535 ? `${m[1]}:${port}` : "";
}

/** Android's `input text` treats spaces and several shell characters specially. */
function escapeText(text) {
  return String(text == null ? "" : text).slice(0, 500)
    .replace(/([\\()<>&|;'"$`*?!#~])/g, "\\$1")
    .replace(/\s/g, "%s");
}

/** Builds the argument vector for one remote-control event. Fractions (0..1) are mapped to the device pixel size. */
function inputArgs(serial, event, dims) {
  const prefix = ["-s", String(serial || ""), "shell", "input"];
  const e = event || {};
  const d = dims || { width: 1080, height: 1920 };
  const px = (v, max) => { const n = Number(v) || 0; return Math.max(0, Math.min(max, Math.round(n >= 0 && n <= 1 ? n * max : n))); };
  if (e.t === "tap") return [...prefix, "tap", px(e.x, d.width), px(e.y, d.height)];
  if (e.t === "swipe" || e.t === "move") return [...prefix, "swipe", px(e.x, d.width), px(e.y, d.height), px(e.x2, d.width), px(e.y2, d.height), Math.min(2000, Math.max(50, Number(e.ms) || 250))];
  if (e.t === "key") {
    const k = String(e.key || "").toLowerCase();
    return [...prefix, "keyevent", String(KEY[k] || (/^[a-z0-9]{1,20}$/.test(k) ? k : KEY.escape))];
  }
  if (e.t === "right") return [...prefix, "keyevent", "82"];
  if (e.t === "text") return [...prefix, "text", escapeText(e.text)];
  return null;
}

/** Maps a linked phone's deviceId to the ADB serial the user paired with it. */
const serials = () => store.load("adbSerials", {});
function pairSerial(deviceId, serial) {
  const s = String(serial || "").trim();
  if (!cleanId(deviceId) || !/^[A-Za-z0-9_.:-]{1,128}$/.test(s)) return false;
  const all = serials();
  all[deviceId] = s;
  store.save("adbSerials", () => all, 0);
  return true;
}
function serialFor(deviceId) { return serials()[cleanId(deviceId)] || ""; }
function cleanId(v) { const s = String(v == null ? "" : v).trim(); return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : ""; }

function create(runner = defaultRunner, toJpeg = null) {
  const run = (args, options) => runner(args, options);
  return {
    async devices() {
      const out = await run(["devices", "-l"]);
      return parseDevices(out.toString("utf8"));
    },
    async connect(address) {
      const addr = cleanAddress(address);
      if (!addr) return { ok: false, error: "Enter an IP and port, for example 192.168.1.20:5555" };
      try {
        const out = (await run(["connect", addr])).toString("utf8");
        return { ok: /connected to|already connected/i.test(out), output: out.trim().slice(0, 300) };
      } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 300) }; }
    },
    /** One `screencap -p` frame. The caller converts the PNG to JPEG for the relay. */
    async frame(serial) {
      const png = await run(["-s", String(serial || ""), "exec-out", "screencap", "-p"]);
      if (!png || png.length < 8 || png[0] !== 0x89 || png.toString("ascii", 1, 4) !== "PNG") throw new Error("bad screencap");
      return toJpeg ? toJpeg(png) : png;
    },
    /** Device pixel size from `wm size`, used to turn fractional controller coordinates into taps. */
    async size(serial) {
      const out = (await run(["-s", String(serial || ""), "shell", "wm", "size"])).toString("utf8");
      const m = /(\d{2,5})x(\d{2,5})/.exec(out);
      return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
    },
    async input(serial, event, screenSize) {
      const dims = screenSize || await this.size(serial).catch(() => null) || { width: 1080, height: 1920 };
      const args = inputArgs(serial, event, dims);
      if (!args) return false;
      await run(args);
      return true;
    },
  };
}

module.exports = {
  create, parseDevices, cleanAddress, escapeText, inputArgs, KEY,
  pairSerial, serialFor, devices: () => create().devices(),
};
