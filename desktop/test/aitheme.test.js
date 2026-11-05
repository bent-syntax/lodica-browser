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
test("reads dark and light variants and an animation", () => {
  const t = parse('{"dark":{"bg":"#101010","text":"#ffffff","accent":"#ff0000","accent2":"#00ff00"},"light":{"bg":"#ffffff","text":"#111111","accent":"#cc0000","accent2":"#00aa00"},"animation":"glow"}');
  assert.strictEqual(t.bg, "#101010");
  assert.strictEqual(t.light.bg, "#FFFFFF");
  assert.strictEqual(t.anim, "glow");
});
test("ignores an unknown animation and a bad light variant", () => {
  const t = parse('{"dark":{"bg":"#101010","text":"#ffffff","accent":"#ff0000","accent2":"#00ff00"},"light":{"bg":"red"},"animation":"explode"}');
  assert.strictEqual(t.anim, undefined);
  assert.strictEqual(t.light, undefined);
});

const base = '"bg":"#1b2a12","text":"#e8f5d0","accent":"#5ac33a","accent2":"#8b5a2b"';
test("keeps tab colours and a known texture", () => {
  const t = parse(`{${base},"tab":"#6b4a2b","tabText":"#fff4e0","tabEdge":"#3a2614","tabTexture":"planks"}`);
  assert.strictEqual(t.tab, "#6B4A2B");
  assert.strictEqual(t.tabText, "#FFF4E0");
  assert.strictEqual(t.tabEdge, "#3A2614");
  assert.strictEqual(t.tabTex, "planks");
});
test("drops an unknown texture and unreadable tab text", () => {
  const t = parse(`{${base},"tab":"#6b4a2b","tabText":"#6b4a2c","tabTexture":"url(http://x)"}`);
  assert.strictEqual(t.tabTex, undefined);
  assert.strictEqual(t.tabText, undefined);
});
test("reads the texture of a light and dark reply", () => {
  const t = parse(`{"dark":{${base},"tabTexture":"dots"},"light":{"bg":"#ffffff","text":"#111111","accent":"#d97706","accent2":"#be185d"}}`);
  assert.strictEqual(t.tabTex, "dots");
  assert.ok(t.light);
});
