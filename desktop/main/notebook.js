// Notebook shared with every linked device, stored on the relay (/api/notebook). Several notes. Mirrors the Android Notebook object.
const relay = require("./relay");

const url = id => "/api/notebook" + (id ? "?id=" + encodeURIComponent(id) : "");

/** Resolves [{ id, title, at }] from the relay, or null when it cannot answer. */
async function list() {
  try {
    const [status, body] = await relay.request("GET", "/api/notebook", 15000);
    return status === 200 ? JSON.parse(body).notes || null : null;
  } catch { return null; }
}

/** Resolves { id, text, rev, at } of one note, or null when the relay cannot answer. */
async function get(id) {
  try {
    const [status, body] = await relay.request("GET", url(id), 15000);
    return status === 200 ? JSON.parse(body) : null;
  } catch { return null; }
}

/** Saves [text] in note [id] on top of revision [base]. Resolves { id, text, rev, at, conflict } or null when the relay cannot answer. A conflict carries the newer note from the relay. { gone: true } when another device deleted the note. */
async function put(id, text, base) {
  try {
    const [status, body] = await relay.request("PUT", url(id), 15000, { text: String(text == null ? "" : text), base: Number.isInteger(base) ? base : undefined });
    if (status === 200) return JSON.parse(body);
    if (status === 409) return { ...JSON.parse(body), conflict: true };
    if (status === 404) return { gone: true };
    return null;
  } catch { return null; }
}

/** Adds an empty note. Resolves the new note or null. */
async function create() {
  try {
    const [status, body] = await relay.request("POST", "/api/notebook", 15000, {});
    return status === 200 ? JSON.parse(body) : null;
  } catch { return null; }
}

/** Deletes note [id]. Resolves the remaining list or null. */
async function remove(id) {
  try {
    const [status, body] = await relay.request("DELETE", url(id), 15000);
    return status === 200 ? JSON.parse(body).notes : null;
  } catch { return null; }
}

module.exports = { list, get, put, create, remove };
