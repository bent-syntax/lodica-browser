// Live view of the linked phone's screen, kept on the relay (/api/screen). Mirrors the Android ScreenShare object.
const relay = require("./relay");

/**
 * Waits up to 20 seconds for a frame newer than `after`.
 * Resolves { seq, img } (img is a data URL), { idle: true } when the phone is not sharing, or null when the relay cannot answer.
 */
async function frame(after) {
  try {
    const [status, body, seq] = await relay.requestRawSeq("GET", "/api/screen?after=" + (Number(after) || 0) + "&wait=20", 30000);
    if (status === 204) return { idle: true };
    if (status !== 200) return null;
    return { seq: Number(seq) || 0, img: "data:image/jpeg;base64," + body.toString("base64") };
  } catch { return null; }
}

/** Stops the share on the relay, so the phone stops sending. */
async function stop() {
  try { const [status] = await relay.request("DELETE", "/api/screen", 15000); return status === 204; } catch { return false; }
}

module.exports = { frame, stop };
