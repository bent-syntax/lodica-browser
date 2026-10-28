"use strict";
const test = require("node:test"), assert = require("node:assert");
const { removeBackground } = require("../main/emojibg");
test("clears flat border, keeps centre", () => {
  const w = 10, h = 10, b = Buffer.alloc(w * h * 4, 255);
  const c = (5 * w + 5) * 4;
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) { const i = (y * w + x) * 4; b[i] = 0; b[i + 1] = 0; b[i + 2] = 200; }
  assert.ok(removeBackground(b, w, h));
  assert.strictEqual(b[3], 0); assert.strictEqual(b[c + 3], 255);
});
test("leaves busy corners alone", () => {
  const b = Buffer.alloc(100, 255); b[0] = 0; b[1] = 0; b[2] = 0;
  assert.strictEqual(removeBackground(b, 5, 5), false);
});
