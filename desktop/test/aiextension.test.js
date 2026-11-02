"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { parse } = require("../main/aiextension");

const mf = (o) => JSON.stringify(Object.assign({ manifest_version: 3, name: "Demo", version: "1.0" }, o));
const reply = (files) => "Here:\n" + JSON.stringify({ files });

test("accepts a content script extension", () => {
  const r = parse(reply({ "manifest.json": mf({ content_scripts: [{ matches: ["<all_urls>"], js: ["c.js"] }] }), "c.js": "1" }));
  assert.equal(r.name, "Demo");
});
test("rejects path escapes, odd types and missing referenced files", () => {
  assert.equal(parse(reply({ "../manifest.json": mf({}) })), null);
  assert.equal(parse(reply({ "manifest.json": mf({}), "x.exe": "1" })), null);
  assert.equal(parse(reply({ "manifest.json": mf({ content_scripts: [{ matches: ["*://*/*"], js: ["gone.js"] }] }) })), null);
});
test("rejects manifest v2 and garbage", () => {
  assert.equal(parse(reply({ "manifest.json": JSON.stringify({ manifest_version: 2, name: "x" }) })), null);
  assert.equal(parse("no json"), null);
});
