"use strict";
// What linked devices merge: passwords, authenticator keys, lists, shortcuts and settings. Plain node, no Electron.
const test = require("node:test"), assert = require("node:assert");
const d = require("../main/linkdata");

test("ten categories, three of them locked behind the link key", () => {
  assert.strictEqual(d.CATS.length, 10);
  assert.deepStrictEqual(d.CATS.filter((c) => c.locked).map((c) => c.id).sort(), ["passwords", "totp", "wifi"]);
  assert.strictEqual(new Set(d.CATS.map((c) => c.id)).size, 10);
});

test("passwords: new ones are added, the newer one wins, junk is skipped", () => {
  const local = [{ origin: "https://a.example", user: "u", pass: "old", saved: 100 }, { origin: "https://keep.example", user: "", pass: "k", saved: 5 }];
  const r = d.mergePasswords(local, [
    { origin: "https://a.example", user: "u", pass: "new", saved: 200 },
    { origin: "https://b.example", user: "v", pass: "p", saved: 1 },
    { origin: "https://older.example", user: "", pass: "x", saved: 1 },
    { origin: "https://bad.example", user: "", pass: "" },
    null, { origin: 5, pass: "x" },
  ]);
  assert.strictEqual(r.changed, 3);
  assert.strictEqual(r.list.find((e) => e.origin === "https://a.example").pass, "new");
  assert.ok(r.list.some((e) => e.origin === "https://b.example"));
  assert.ok(!r.list.some((e) => e.origin === "https://bad.example"));
  assert.strictEqual(r.list.find((e) => e.origin === "https://keep.example").pass, "k");
  // an older copy never replaces a newer one
  const r2 = d.mergePasswords(r.list, [{ origin: "https://a.example", user: "u", pass: "stale", saved: 50 }]);
  assert.strictEqual(r2.list.find((e) => e.origin === "https://a.example").pass, "new");
});

test("authenticator keys: added by secret, never replaced, never duplicated", () => {
  let n = 0;
  const local = [{ id: "1", label: "Mine", secret: "AAAA" }];
  const r = d.mergeTotp(local, [{ label: "Mine again", secret: "AAAA" }, { label: "Other", secret: "BBBB", digits: 8, period: 60 }, { label: "Other twice", secret: "BBBB" }, { secret: "" }], () => "id" + ++n);
  assert.strictEqual(r.changed, 1);
  assert.strictEqual(r.list.length, 2);
  assert.strictEqual(r.list[0].label, "Mine");
  assert.deepStrictEqual([r.list[1].secret, r.list[1].digits, r.list[1].period, r.list[1].id], ["BBBB", 8, 60, "id1"]);
});

test("lists are joined, shortcuts too", () => {
  assert.deepStrictEqual(d.union(["a.com"], ["b.com", "a.com", ""]).list, ["a.com", "b.com"]);
  const s = d.mergeShortcuts([{ url: "https://a.example", title: "A" }], [{ url: "https://a.example" }, { url: "https://b.example", title: "B" }, { url: "javascript:alert(1)" }]);
  assert.deepStrictEqual(s.list.map((t) => t.url), ["https://a.example", "https://b.example"]);
});

test("settings: only known keys of the same kind come through", () => {
  const cur = { theme: "dark", uiAlpha: 100, spell: true, plannerIcs: "https://private", routeVps: false, language: "EN" };
  const got = d.pickSettings({ theme: "nord", uiAlpha: "x", spell: false, plannerIcs: "https://evil", routeVps: true, language: "NL", extra: 1 }, cur);
  assert.deepStrictEqual(got, { theme: "nord", spell: false, language: "NL" });
});
