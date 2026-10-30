"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { canClaim, daysTo, find, list } = require("../main/holidays");

test("claim window is 7 days either side", () => {
  assert.equal(canClaim("halloween", new Date(2026, 9, 24)), true);
  assert.equal(canClaim("halloween", new Date(2026, 9, 23)), false);
  assert.equal(canClaim("halloween", new Date(2026, 10, 7)), true);
  assert.equal(canClaim("halloween", new Date(2026, 10, 8)), false);
});
test("window crosses the year boundary", () => {
  assert.equal(canClaim("new-year", new Date(2026, 11, 26)), true);
  assert.equal(canClaim("new-year", new Date(2027, 0, 8)), true);
  assert.equal(canClaim("new-year", new Date(2027, 0, 9)), false);
  assert.equal(daysTo(find("new-year"), new Date(2026, 11, 31)), 1);
});
test("unknown ids and list", () => {
  assert.equal(canClaim("nope", new Date()), false);
  const r = list(["christmas"], new Date(2026, 9, 30));
  assert.equal(r.find((x) => x.id === "halloween").claimable, true);
  assert.equal(r.find((x) => x.id === "christmas").claimed, true);
  assert.equal(r.find((x) => x.id === "christmas").claimable, false);
});
