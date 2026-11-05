"use strict";
const test = require("node:test");
const assert = require("node:assert");
const I = require("../search/instant");

const now = new Date(2026, 10, 5, 12, 0, 0);
const ask = (q, o) => I.answer(q, Object.assign({ now, lang: "en", rand: () => 0.5 }, o || {}));

test("speed test opens only a button card", () => {
  assert.strictEqual(ask("speedtest").type, "speed");
  assert.strictEqual(ask("internet speed test").type, "speed");
});

test("date and week questions", () => {
  const d = ask("what day is it today");
  assert.strictEqual(d.type, "date");
  assert.strictEqual(d.doy, 309);
  assert.strictEqual(d.week, 45);
  assert.match(d.big, /Thursday/);
  assert.strictEqual(ask("what week is it").week, 45);
});

test("countdown to holidays", () => {
  assert.strictEqual(ask("when is christmas").days, 50);
  assert.strictEqual(ask("how many days until christmas").days, 50);
  assert.strictEqual(ask("days until new year").days, 57);
  assert.strictEqual(ask("when is easter").days, 143);
  assert.strictEqual(ask("days until 25 december 2026").days, 50);
});

test("easter dates", () => {
  assert.deepStrictEqual(I.easter(2026), [3, 5]);
  assert.deepStrictEqual(I.easter(2027), [2, 28]);
});

test("dutch labels", () => {
  const d = ask("when is christmas", { lang: "nl" });
  assert.strictEqual(d.days, 50);
  assert.match(d.big, /dagen/);
});

test("timers, stopwatch, tools", () => {
  assert.strictEqual(ask("stopwatch").type, "stopwatch");
  assert.strictEqual(ask("timer").seconds, 300);
  assert.strictEqual(ask("5 minute timer").seconds, 300);
  assert.strictEqual(ask("set a timer for 10 minutes").seconds, 600);
  assert.strictEqual(ask("timer 1h 30m").seconds, 5400);
  assert.strictEqual(ask("color picker").type, "color");
  assert.deepStrictEqual([ask("#ff8800").r, ask("#ff8800").g, ask("#ff8800").b], [255, 136, 0]);
  assert.strictEqual(ask("calculator").type, "calculator");
});

test("dice, coin and random number", () => {
  const d = ask("2d20");
  assert.strictEqual(d.type, "dice");
  assert.strictEqual(d.rolls.length, 2);
  assert.strictEqual(d.sides, 20);
  assert.strictEqual(ask("roll a dice").sides, 6);
  assert.ok(["heads", "tails"].includes(ask("flip a coin").side));
  const r = ask("random number 1 to 100");
  assert.ok(r.value >= 1 && r.value <= 100);
});

test("time, moon, leap year, calendar", () => {
  assert.strictEqual(ask("time in tokyo").zone, "Asia/Tokyo");
  assert.strictEqual(ask("what time is it").type, "time");
  assert.strictEqual(ask("moon phase").type, "moon");
  assert.strictEqual(ask("is 2028 a leap year").leap, true);
  assert.strictEqual(ask("is 2027 a leap year").leap, false);
  const c = ask("calendar march 2027");
  assert.deepStrictEqual([c.type, c.y, c.m], ["calendar", 2027, 2]);
  assert.strictEqual(ask("how many days in february").big, "28 days");
});

test("calculator without eval", () => {
  assert.strictEqual(ask("2+2").value, 4);
  assert.strictEqual(ask("2+2*3").value, 8);
  assert.strictEqual(ask("15% of 80").value, 12);
  assert.strictEqual(ask("sqrt(16)").value, 4);
  assert.strictEqual(ask("5!").value, 120);
  assert.strictEqual(ask("what is 2^10").value, 1024);
  assert.strictEqual(ask("3 x 4").value, 12);
  assert.strictEqual(ask("1,000 + 5").value, 1005);
  assert.strictEqual(ask("process.exit(1)"), null);
  assert.strictEqual(ask("alert(1)+1"), null);
});

test("unit conversion", () => {
  const km = ask("5 km to miles");
  assert.strictEqual(km.type, "convert");
  assert.ok(Math.abs(km.value - 3.10686) < 1e-4);
  assert.strictEqual(ask("10 c to f").value, 50);
  assert.strictEqual(ask("100 mb to gb").value, 0.1);
  assert.ok(Math.abs(ask("1 lb in kg").value - 0.45359237) < 1e-9);
});

test("roman numerals", () => {
  assert.strictEqual(ask("12 in roman numerals").big, "XII");
  assert.strictEqual(ask("xiv to number").big, "14");
});

test("currency and weather need the network, so they are skipped in private tabs", () => {
  assert.deepStrictEqual(ask("100 usd to eur"), { type: "currency", amount: 100, from: "USD", to: "EUR" });
  assert.strictEqual(ask("weather in brussels").type, "weather");
  assert.strictEqual(ask("100 usd to eur", { priv: true }), null);
  assert.strictEqual(ask("weather in brussels", { priv: true }), null);
});

test("ordinary searches stay untouched", () => {
  for (const q of ["hello", "hello world", "iphone 15", "1-2-3", "2026-11-05", "weather", "kerst", "", "x".repeat(200)]) {
    assert.strictEqual(ask(q), null, q);
  }
});
