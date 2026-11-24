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

/** Android wireless pairing codes are six digits; accept the spaced form people copy from the phone. */
function cleanPairCode(value) {
  const s = String(value == null ? "" : value).replace(/[\s-]/g, "");
  return /^\d{6}$/.test(s) ? s : "";
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

/** ADB serials are host:port, mDNS service names or USB ids; no spaces or shell metacharacters are ever accepted. */
function cleanSerial(value) {
  const s = String(value == null ? "" : value).trim();
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(s) && !/^(?:__proto__|constructor|prototype|toString|valueOf)$/i.test(s) ? s : "";
}
/** mDNS auto-connect gives wireless phones service-name serials instead of host:port ones. */
const isWirelessSerial = (s) => !!cleanAddress(s) || /^[A-Za-z0-9_-]{1,96}\._adb-tls-connect\._tcp$/.test(String(s || ""));

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
const map = (name) => Object.assign(Object.create(null), store.load(name, {}));
const serials = () => map("adbSerials");
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function pairSerial(deviceId, serial) {
  const id = cleanId(deviceId), s = cleanSerial(serial);
  if (!id || !s) return false;
  const all = serials();
  all[id] = s;
  store.save("adbSerials", () => all, 0);
  return true;
}
function serialFor(deviceId) {
  const v = serials()[cleanId(deviceId)];
  return typeof v === "string" ? v : "";
}
function cleanId(v) {
  const s = String(v == null ? "" : v).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) && !/^(?:__proto__|constructor|prototype|toString|valueOf)$/i.test(s) ? s : "";
}

/**
 * Paired ADB devices are remembered by serial so they can be selected from the list later without pairing again.
 * Wireless serials are host:port or mDNS service names, and are reconnected when the controller opens.
 */
const paired = () => map("adbPaired");
function rememberPaired(serial, name) {
  const s = cleanSerial(serial);
  if (!s) return false;
  const all = paired();
  all[s] = String(name || all[s] || "").slice(0, 80); // a later connect must not wipe the phone's model name
  store.save("adbPaired", () => all, 0);
  return true;
}
/** Forgetting a phone removes both the remembered address and any phone association that pointed at it. */
function forgetPaired(serial) {
  const s = cleanSerial(serial);
  const all = paired();
  if (!s || !has(all, s)) return false;
  delete all[s];
  store.save("adbPaired", () => all, 0);
  const links = serials();
  for (const id of Object.keys(links)) if (links[id] === s) delete links[id];
  store.save("adbSerials", () => links, 0);
  return true;
}
function pairedList() {
  return Object.entries(paired())
    .filter(([serial]) => cleanSerial(serial))
    .map(([serial, name]) => ({ serial, name: typeof name === "string" ? name : "", wireless: isWirelessSerial(serial) }));
}

function create(runner = defaultRunner, toJpeg = null, delay = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const run = (args, options) => runner(args, options);
  async function connectRaw(value) {
    const s = cleanSerial(value);
    if (!s) return { ok: false, error: "Enter a valid ADB address or serial" };
    try {
      const out = (await run(["connect", s])).toString("utf8");
      return { ok: /connected to|already connected/i.test(out), output: out.trim().slice(0, 300) };
    } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 300) }; }
  }
  const connectAddress = (address) => cleanAddress(address)
    ? connectRaw(address)
    : Promise.resolve({ ok: false, error: "Enter an IP and port, for example 192.168.1.20:5555" });
  const devices = async () => parseDevices((await run(["devices", "-l"])).toString("utf8"));

  /** Android's pairing port is one-shot; the real serial appears on the connection port or as an mDNS service. */
  async function discoverSerial(host, guid, connectionAddress) {
    const pick = (list) => {
      const live = list.filter((d) => d.online && isWirelessSerial(d.serial));
      if (connectionAddress) {
        const exact = live.find((d) => d.serial === connectionAddress);
        if (exact) return exact;
      }
      if (guid) {
        const byGuid = live.find((d) => d.serial.includes(guid));
        if (byGuid) return byGuid;
      }
      return live.find((d) => d.serial.startsWith(host + ":")) ||
        (guid ? live.find((d) => d.serial.startsWith("adb-")) : null) || null;
    };
    if (connectionAddress) await connectRaw(connectionAddress).catch(() => {});
    for (let i = 0; i < 4; i++) {
      const found = pick(await devices().catch(() => []));
      if (found) return found;
      if (i < 3) await delay(250);
    }
    // Fallback when mDNS auto-connect is disabled: ask ADB which connect service it discovered on this host.
    try {
      const mdns = (await run(["mdns", "services"])).toString("utf8");
      for (const line of mdns.split(/\r?\n/)) {
        if (!/_adb-tls-connect\._tcp/.test(line)) continue;
        const ip = /\b\d{1,3}(?:\.\d{1,3}){3}\b/.exec(line);
        const port = /\b(\d{1,5})\b(?!.*\b\d{1,5}\b)/.exec(line);
        if (!ip || !port || ip[0] !== host) continue;
        const addr = cleanAddress(ip[0] + ":" + port[1]);
        if (!addr) continue;
        await connectRaw(addr).catch(() => {});
        const found = pick(await devices().catch(() => []));
        if (found) return found;
      }
    } catch {}
    return null;
  }

  return {
    async devices() { return devices(); },
    async connect(address) { return connectAddress(address); },
    /** Reconnect a remembered serial, including mDNS service names. */
    async connectSerial(serial) { return connectRaw(serial); },
    /**
     * Pair once with Android's six-digit wireless pairing code. The pairing port is never stored: the phone's real
     * ADB serial is discovered from `adb devices` / mDNS, or from the optional connection address on the phone screen.
     */
    async pairWireless(address, code, connectionAddress) {
      const addr = cleanAddress(address), pin = cleanPairCode(code);
      const conn = String(connectionAddress || "").trim() ? cleanAddress(connectionAddress) : "";
      if (!addr) return { ok: false, error: "Enter the phone's IP and pairing port, for example 192.168.1.20:4444" };
      if (!pin) return { ok: false, error: "The pairing code is six digits" };
      if (String(connectionAddress || "").trim() && !conn) return { ok: false, error: "The connection address must be an IP and port" };
      try {
        const out = (await run(["pair", addr, pin])).toString("utf8");
        if (!/successfully paired|already paired/i.test(out)) return { ok: false, error: out.trim().slice(0, 300) || "Pairing failed" };
        const guid = (/guid=([A-Za-z0-9_-]+)/i.exec(out) || [])[1] || "";
        const found = await discoverSerial(addr.split(":")[0], guid, conn);
        if (!found) return {
          ok: false, paired: true,
          error: "Paired, but the phone is not connected. Enter the IP and connection port shown on Wireless debugging and press Connect.",
          output: out.trim().slice(0, 300),
        };
        return { ok: true, serial: found.serial, model: found.model, output: out.trim().slice(0, 300) };
      } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 300) }; }
    },
    /** Reconnect remembered wireless phones. Best effort: a phone that is asleep simply fails this round. */
    async autoConnect() {
      const out = [];
      for (const p of pairedList().filter((x) => x.wireless)) out.push({ serial: p.serial, ...(await connectRaw(p.serial)) });
      return out;
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
  create, parseDevices, cleanAddress, cleanSerial, cleanPairCode, isWirelessSerial, escapeText, inputArgs, KEY,
  pairSerial, serialFor, rememberPaired, forgetPaired, pairedList,
  devices: () => create().devices(),
};
