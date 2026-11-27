"use strict";
// Reverse image search: Google and Bing go through the held-image form page, bad input is refused, held images are one per id.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ri = require("../main/reverseimage");

(async () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const g = await ri.urlFor(png, "google");
  assert.ok(/^lodica:\/\/pdf\/web\/revsearch\.html\?e=google&id=[0-9a-f]{24}$/.test(g), g);
  const id = g.split("id=")[1];
  assert.deepStrictEqual(ri.take(id), png, "the held image comes back by id");
  assert.strictEqual(ri.take("nope"), null);
  assert.ok((await ri.urlFor(png, "bing")).includes("e=bing"));
  assert.ok((await ri.urlFor(png, "unknown")).includes("e=google"), "an unknown engine falls back to Google");
  await assert.rejects(() => ri.urlFor(Buffer.alloc(0), "google"));
  await assert.rejects(() => ri.urlFor("not a buffer", "google"));
  const page = fs.readFileSync(path.join(__dirname, "..", "pdf", "web", "revsearch.html"), "utf8");
  assert.ok(/form-action[^"]*google[^"]*bing/.test(page), "the form page may only post to the two engines");
  const menu = fs.readFileSync(path.join(__dirname, "..", "ui", "js", "menu.js"), "utf8");
  assert.ok(menu.includes('"image.search"'), "images get a Search image item in the context menu");
  console.log("reverse image ok");
})().catch((e) => { console.error(e); process.exit(1); });
