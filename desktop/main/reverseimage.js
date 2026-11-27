"use strict";
// Reverse image search: finds where a picture comes from and similar pictures. The picture goes to the engine the user picked
// (Settings > Search) and nowhere else. Google and Bing take a form post made by the browser itself (so its cookies and consent
// apply); Yandex answers an upload with an address.
const crypto = require("crypto");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const ENGINES = ["google", "bing", "yandex"];
const held = new Map(); // id -> { png, at }: crops waiting for lodica://pdf/web/revsearch.html to post them

function hold(png) {
  const now = Date.now();
  for (const [k, v] of held) if (now - v.at > 10 * 60e3) held.delete(k);
  while (held.size > 20) held.delete(held.keys().next().value);
  const id = crypto.randomBytes(12).toString("hex");
  held.set(id, { png, at: now });
  return id;
}
const take = (id) => (held.get(String(id)) || {}).png || null;

async function yandex(png) {
  const fd = new FormData();
  fd.append("upfile", new Blob([png], { type: "image/png" }), "image.png");
  const req = encodeURIComponent(JSON.stringify({ blocks: [{ block: "b-page_type_search-by-image__link" }] }));
  const r = await fetch("https://yandex.com/images/search?rpt=imageview&format=json&request=" + req, { method: "POST", body: fd, headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("Yandex answered " + r.status);
  const id = ((await r.json()).blocks || []).map((b) => b && b.params && b.params.cbirId).find(Boolean);
  if (!id) throw new Error("Yandex gave no result");
  return "https://yandex.com/images/search?rpt=imageview&cbir_id=" + encodeURIComponent(id);
}

/** The address to open in a tab for these image bytes (PNG/JPEG/WebP/GIF). */
async function urlFor(png, engine) {
  if (!Buffer.isBuffer(png) || !png.length || png.length > 20 * 1024 * 1024) throw new Error("Bad image");
  const e = ENGINES.includes(engine) ? engine : "google";
  if (e === "yandex") return yandex(png);
  return "lodica://pdf/web/revsearch.html?e=" + e + "&id=" + hold(png);
}

module.exports = { urlFor, take, ENGINES };
