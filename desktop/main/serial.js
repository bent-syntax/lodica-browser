// Web Serial, WebUSB and WebHID: device picker plus remembered grants, like Chrome and Edge.
// Pages see only devices the user picked; grants are per origin and not stored for private tabs.
const { session } = require("electron");
const store = require("./store");

let ui = null;
let saved = store.load("devices", {}); // "origin|key" -> true
const memory = new Set(); // grants made in private sessions
const persist = () => store.save("devices", () => saved);

const originOf = u => { try { const x = new URL(u); return x.protocol === "file:" ? "file://" : x.origin; } catch { return ""; } };
const keyOf = (type, d) => [type, d.vendorId ?? "", d.productId ?? "", d.serialNumber ?? "", d.portName ?? d.name ?? ""].join(":");

function label(d) {
  const n = d.displayName || d.productName || d.name || d.portName || "Unknown device";
  return d.portName && !n.includes(d.portName) ? `${n} (${d.portName})` : n;
}

function grant(ses, origin, key) {
  const id = origin + "|" + key;
  if (ses === session.defaultSession) { saved[id] = true; persist(); } else memory.add(id);
}
const has = (ses, origin, key) => (ses === session.defaultSession ? saved[origin + "|" + key] === true : memory.has(origin + "|" + key));

/** Ask which device to share; resolves with the chosen list entry or null. */
async function choose(title, list, origin) {
  const v = await ui.prompt({
    kind: "select", title, cancel: "Cancel",
    message: list.length ? origin : "No devices found. Plug one in and try again.",
    options: list.map((d, i) => ({ label: label(d), value: i })),
  }).catch(() => null);
  return typeof v === "number" && list[v] ? list[v] : null;
}

function wire(ses) {
  ses.setDevicePermissionHandler(d => has(ses, originOf(d.origin === "null" ? "file:///" : d.origin), keyOf(d.deviceType, d.device)));

  ses.on("select-serial-port", async (e, ports, wc, cb) => {
    e.preventDefault();
    const origin = originOf(wc?.getURL() || "");
    const p = await choose("Select a serial port", ports, origin);
    if (p) grant(ses, origin, keyOf("serial", p));
    cb(p ? p.portId : "");
  });
  ses.on("select-usb-device", async (e, details, cb) => {
    e.preventDefault();
    const origin = originOf(details.frame?.url || "");
    const p = await choose("Select a USB device", details.deviceList, origin);
    if (p) grant(ses, origin, keyOf("usb", p));
    cb(p ? p.deviceId : undefined);
  });
  ses.on("select-hid-device", async (e, details, cb) => {
    e.preventDefault();
    const origin = originOf(details.frame?.url || "");
    const p = await choose("Select a HID device", details.deviceList, origin);
    if (p) grant(ses, origin, keyOf("hid", p));
    cb(p ? p.deviceId : undefined);
  });
}

function init(d) {
  ui = d.ui;
  for (const ses of d.sessions) wire(ses);
}

function reset() { saved = {}; memory.clear(); persist(); return true; }

module.exports = { init, reset };
