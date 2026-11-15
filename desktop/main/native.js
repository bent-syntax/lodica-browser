// Loads the Rust addon (core's ipc dispatcher). null when absent, so callers keep their JS fallback.
const path = require("path");

let addon = null;
for (const p of [
  process.resourcesPath && path.join(process.resourcesPath, "lodica_native.node"),
  path.join(__dirname, "..", "native", "lodica_native.node"),
]) {
  if (!p) continue;
  try { addon = require(p); break; } catch { /* try next */ }
}

const call = addon ? (cmd, args) => JSON.parse(addon.call(cmd, JSON.stringify(args || {}), Date.now())) : null;

module.exports = { call };
