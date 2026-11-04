"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cleanArt } = require("../main/faceart");

test("keeps allowed shapes and re-wraps them in a 64x64 svg", () => {
  const out = cleanArt('<svg viewBox="0 0 10 10"><circle cx="32" cy="16" r="12" fill="#f59e0b"/><rect x="20" y="34" width="24" height="20" rx="4" fill="#1f2937"/></svg>');
  assert.equal(out, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="16" r="12" fill="#f59e0b"/><rect x="20" y="34" width="24" height="20" rx="4" fill="#1f2937"/></svg>');
});

test("drops scripts, event handlers, urls, images and named colours", () => {
  const out = cleanArt('<svg><script>alert(1)</script><image href="http://x/y.png"/><circle cx="1" cy="1" r="5" fill="red" onload="x()" stroke="#fff"/><path d="M0 0 L9 9" fill="url(#a)"/></svg>');
  assert.ok(!/script|image|onload|url|red|href/.test(out), out);
  assert.match(out, /<circle cx="1" cy="1" r="5" stroke="#fff"\/>/);
  assert.match(out, /<path d="M0 0 L9 9"\/>/);
});

test("returns empty for nothing drawable, wrong types and oversize input", () => {
  assert.equal(cleanArt("<svg><script>alert(1)</script></svg>"), "");
  assert.equal(cleanArt("just words"), "");
  assert.equal(cleanArt(null), "");
  assert.equal(cleanArt("<circle r=\"3\"/>".repeat(1000)), "");
});

test("shapes missing a required attribute are dropped", () => {
  assert.equal(cleanArt('<circle cx="3" cy="3"/>'), "");
});

test("caps the number of shapes", () => {
  const out = cleanArt('<circle cx="3" cy="3" r="2"/>'.repeat(60));
  assert.equal((out.match(/<circle/g) || []).length, 40);
});

test("desktop and relay copies stay identical", () => {
  const a = fs.readFileSync(path.join(__dirname, "..", "main", "faceart.js"), "utf8");
  const b = fs.readFileSync(path.join(__dirname, "..", "..", "relay", "src", "faceart.js"), "utf8");
  assert.equal(a, b);
});
