// Device gate: a random 256-bit token per install, kept in safeStorage. Hosts in the "gatedHosts" pref get it
// as X-Lodica-Gate on every request. Enrolling posts the token to the relay as pending and returns a pairing code
// that the server owner approves with `sudo lodica-approve <code>`.
const crypto = require("crypto");
const os = require("os");
const store = require("./store");
const prefs = require("./prefs");
const relay = require("./relay");

let token = null;

function load() {
  if (token) return token;
  const saved = store.loadSecret("deviceGate", null);
  if (saved && /^[0-9a-f]{64}$/.test(saved.token)) token = saved.token;
  return token;
}

/** Creates the token on first use. Returns null when secure storage is unavailable (token is never kept in plain text). */
function ensure() {
  if (load()) return token;
  const t = crypto.randomBytes(32).toString("hex");
  if (!store.saveSecret("deviceGate", { token: t })) return null;
  token = t;
  return token;
}

const normalize = h => String(h || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "");
const gated = host => {
  const h = normalize(host);
  return !!h && (prefs.p.gatedHosts || []).some(g => h === g || h.endsWith("." + g));
};

/** Header value for a request to [host], or null when the host is not gated or the device has no token. */
function headerFor(host) { return gated(host) && load() ? token : null; }

async function enroll() {
  if (!relay.available) return { ok: false, error: "Link your server first" };
  const t = ensure();
  if (!t) return { ok: false, error: "Secure storage is not available on this system" };
  try {
    const [status, body] = await relay.request("POST", "/enroll", 15000, { token: t, label: "Lodica desktop on " + os.hostname() });
    if (status !== 200) return { ok: false, error: status === 429 ? "Too many requests, try again in a minute" : "Server answered " + status };
    const r = JSON.parse(body);
    return { ok: true, code: r.code, expires: r.expires };
  } catch { return { ok: false, error: "Couldn't reach the server" }; }
}

const state = () => ({ enrolled: !!load(), hosts: prefs.p.gatedHosts || [] });

module.exports = { headerFor, enroll, state, normalize };
