"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { parse } = require("../main/aitheme");

test("accepts a valid reply with surrounding text", () => {
  const t = parse('Here: {"bg":"#1b2a12","text":"#e8f5d0","accent":"#5ac33a","accent2":"#8b5a2b","raised":"#25381a"}');
  assert.strictEqual(t.bg, "#1B2A12");
  assert.strictEqual(t.raised, "#25381A");
});
test("rejects missing or bad colours", () => {
  assert.strictEqual(parse('{"bg":"red","text":"#ffffff","accent":"#ff0000","accent2":"#00ff00"}'), null);
  assert.strictEqual(parse("no json"), null);
  assert.strictEqual(parse('{"bg":"#000000"}'), null);
});
test("fixes unreadable text", () => {
  const t = parse('{"bg":"#101010","text":"#151515","accent":"#ff0000","accent2":"#00ff00"}');
  assert.strictEqual(t.text, "#F5F5F5");
});
test("drops hostile extra keys", () => {
  const t = parse('{"bg":"#101010","text":"#ffffff","accent":"#ff0000","accent2":"#00ff00","x":"url(javascript:1)"}');
  assert.deepStrictEqual(Object.keys(t).sort(), ["accent", "accent2", "bg", "text"]);
});
