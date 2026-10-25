// Notebook shared with every linked device, stored on the relay (/api/notebook). Mirrors the Android Notebook object.
const relay = require("./relay");

/** Resolves { text, rev, at } from the relay, or null when it cannot answer. */
async function get() {
  try {
    const [status, body] = await relay.request("GET", "/api/notebook", 15000);
    return status === 200 ? JSON.parse(body) : null;
  } catch { return null; }
}

/** Saves [text] on top of revision [base]. Resolves { text, rev, at, conflict } or null when the relay cannot answer. A conflict carries the newer note from the relay. */
async function put(text, base) {
  try {
    const [status, body] = await relay.request("PUT", "/api/notebook", 15000, { text: String(text == null ? "" : text), base: Number.isInteger(base) ? base : undefined });
    if (status === 200) return JSON.parse(body);
    if (status === 409) return { ...JSON.parse(body), conflict: true };
    return null;
  } catch { return null; }
}

module.exports = { get, put };
