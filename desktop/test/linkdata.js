"use strict";
// What linked devices merge: passwords, authenticator keys, lists, shortcuts and settings. Plain node, no Electron.
const test = require("node:test"), assert = require("node:assert");
const d = require("../main/linkdata");

test("twelve categories, three of them locked behind the link key", () => {
  assert.strictEqual(d.CATS.length, 12);
  assert.deepStrictEqual(d.CATS.filter((c) => c.locked).map((c) => c.id).sort(), ["passwords", "totp", "wifi"]);
  assert.strictEqual(new Set(d.CATS.map((c) => c.id)).size, 12);
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

test("settings: search words, shortcut names and start layout come through, cleaned", () => {
  const cur = { searchWords: [], shortcutNames: true, plannerPos: "below", notesPos: "left", customTheme: null };
  const got = d.pickSettings({
    searchWords: [{ word: "yt", url: "https://youtube.com" }, { word: "", url: "x" }, "junk"],
    shortcutNames: false, plannerPos: "middle", notesPos: "right",
    customTheme: { bg: "#000000", text: "#ffffff", accent: "#f59e0b", accent2: "#f43f5e" },
  }, cur);
  assert.deepStrictEqual(got, {
    searchWords: [{ word: "yt", url: "https://youtube.com" }], shortcutNames: false, notesPos: "right",
    customTheme: { bg: "#000000", text: "#ffffff", accent: "#f59e0b", accent2: "#f43f5e" },
  });
});

const ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#f59e0b"/></svg>';

test("character: one per user, a requested one beats an invented one, then the newer wins", () => {
  const auto = { glyph: "fox", art: ART, at: 5 }, mine = { glyph: "owl", art: ART, custom: true, desc: "an owl", at: 1 };
  assert.deepStrictEqual(d.mergeCharacter(null, null), { value: null, changed: false });
  assert.strictEqual(d.mergeCharacter(null, auto).value.glyph, "fox");
  assert.strictEqual(d.mergeCharacter(auto, mine).value.glyph, "owl");
  assert.strictEqual(d.mergeCharacter(mine, auto).changed, false);
  const newer = { glyph: "cat", art: ART, at: 9 };
  assert.strictEqual(d.mergeCharacter(auto, newer).value.glyph, "cat");
  assert.strictEqual(d.mergeCharacter(newer, auto).value.glyph, "cat");
});

test("character: both orders give the same result and bad art is dropped", () => {
  const a = { glyph: "a", art: ART, at: 3 }, b = { glyph: "b", art: ART, at: 3 };
  assert.deepStrictEqual(d.mergeCharacter(a, b).value, d.mergeCharacter(b, a).value);
  const c = d.cleanCharacter({ glyph: "x", art: "<svg><script>alert(1)</script></svg>", hands: 5 });
  assert.strictEqual(c.art, "");
  assert.strictEqual(c.hands, "");
  assert.strictEqual(d.cleanCharacter({ art: "nope" }), null);
});

test("notes: newer edit wins, deletes travel, junk ids are skipped", () => {
  const T = Date.now() - 1000;
  const mine = [{ id: "a", text: "one", at: T + 10, rev: 2 }, { id: "b", text: "keep", at: T + 5, rev: 1 }];
  const r = d.mergeNotes(mine, [{ id: "a", text: "two", at: T + 20 }, { id: "b", text: "old", at: T + 1 }, { id: "c", text: "new", at: T + 7 }, { id: "../x", text: "bad", at: T + 9 }]);
  const by = Object.fromEntries(r.list.map((n) => [n.id, n]));
  assert.strictEqual(by.a.text, "two");
  assert.strictEqual(by.a.rev, 3);
  assert.strictEqual(by.b.text, "keep");
  assert.strictEqual(by.c.text, "new");
  assert.strictEqual(by["../x"], undefined);
  assert.strictEqual(r.changed, 2);
  const gone = d.mergeNotes(r.list, [{ id: "a", deleted: true, at: T + 30 }]);
  assert.strictEqual(gone.list.find((n) => n.id === "a").deleted, true);
  assert.strictEqual(d.mergeNotes(gone.list, [{ id: "a", text: "back", at: T + 25 }]).list.find((n) => n.id === "a").deleted, true);
});

test("notes: the same data again changes nothing, old deletes are forgotten", () => {
  const list = [{ id: "a", text: "x", at: 10, rev: 1 }];
  assert.strictEqual(d.mergeNotes(list, [{ id: "a", text: "x", at: 10 }]).changed, 0);
  const old = d.mergeNotes([], [{ id: "z", deleted: true, at: 1 }], 1 + 31 * 24 * 3600e3);
  assert.strictEqual(old.list.length, 0);
});

test("notes for sync: newest whole notes first, within the budget", () => {
  const list = [{ id: "a", text: "x".repeat(60), at: 1 }, { id: "b", text: "y".repeat(60), at: 2 }, { id: "c", deleted: true, text: "", at: 3 }];
  const out = d.notesForSync(list, 150);
  assert.deepStrictEqual(out.map((n) => n.id), ["c", "b"]);
  assert.strictEqual(out[0].deleted, true);
});
