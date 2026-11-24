"use strict";
// Linked-device registry for remote control. Every app on the relay token announces its id, name and platform here;
// each remote-control panel remembers which device it is pointed at. No screen data goes through this registry.
const crypto = require("crypto");
const os = require("os");
const relay = require("./relay");
const store = require("./store");

let timer = 0;
let current = [];
let onList = null;
const cleanId = (v) => {
  const s = String(v == null ? "" : v).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : "";
};

function id() {
  let s = store.loadSecret("remoteDeviceId", null);
  if (typeof s !== "string" || !cleanId(s)) {
    s = crypto.randomBytes(16).toString("hex");
    store.saveSecret("remoteDeviceId", s);
  }
  return s;
}

function name() {
  const s = String(os.hostname() || "Computer").trim();
  return s.slice(0, 80) || "Computer";
}

const targets = () => store.load("remoteTargets", { android: "", desktop: "" });
function target(platform) {
  const p = platform === "desktop" ? "desktop" : "android";
  const saved = cleanId(targets()[p]);
  const pool = current.filter((d) => d.platform === p && d.id !== id());
  if (saved && pool.some((d) => d.id === saved)) return saved;
  return (pool.find((d) => d.online) || pool[0] || {}).id || "";
}
function setTarget(platform, deviceId) {
  const p = platform === "desktop" ? "desktop" : "android";
  const v = cleanId(deviceId);
  const t = targets();
  if (!v) delete t[p]; else t[p] = v;
  store.save("remoteTargets", () => t, 0);
  return target(p);
}

async function refresh() {
  if (!relay.available) { current = []; return current; }
  try {
    const [status, body] = await relay.request("POST", "/api/devices", 10000, { id: id(), name: name(), platform: "desktop" });
    if (status !== 200) return current;
    const [listStatus, listBody] = await relay.request("GET", "/api/devices", 10000);
    if (listStatus !== 200) return current;
    const j = JSON.parse(listBody || "{}");
    current = Array.isArray(j.devices) ? j.devices.filter((d) => d && cleanId(d.id)).map((d) => ({
      id: d.id, name: String(d.name || "Device").slice(0, 80),
      platform: d.platform === "android" ? "android" : "desktop",
      online: !!d.online,
    })) : [];
    if (onList) onList(list());
  } catch { /* relay offline: keep the last known list */ }
  return current;
}

function list(platform) {
  const pool = current.filter((d) => d.id !== id() && (!platform || d.platform === platform));
  return pool.map((d) => ({ ...d, selected: d.id === target(d.platform) }));
}

function init() {
  if (timer) return;
  refresh();
  timer = setInterval(refresh, 30_000);
  if (timer.unref) timer.unref();
}

function onChange(fn) { onList = typeof fn === "function" ? fn : null; }

/** Test hook. */
function setList(list) { current = Array.isArray(list) ? list : []; }

module.exports = { init, id, name, refresh, list, target, setTarget, onChange, setList, cleanId };
