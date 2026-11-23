"use strict";
// Client-side QR encoder: no upload, no online service, nothing that can expire.
// The renderer asks for a data URL and draws/downloads it locally.

function normalise(input) {
  const text = String(input == null ? "" : input).trim();
  if (!text || text.length > 2000) return null;
  return text;
}

async function data(input) {
  const text = normalise(input);
  if (!text) return null;
  const qrcode = require("qrcode");
  return qrcode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256,
    color: { dark: "#1A1300ff", light: "#FFFFFFff" },
  });
}

module.exports = { normalise, data };
