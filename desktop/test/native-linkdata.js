// Rust and JS link merge logic must agree. Skips when the addon is not built.
const assert = require("assert");
const ld = require("../main/linkdata");
const { call } = require("../main/native");
if (!call) { console.log("native addon absent, skipped"); process.exit(0); }
const js = ld._js;
const pw = [{ id: "a", site: "x.com", user: "u", pass: "p", at: 1 }, { id: "b", site: "y.com", user: "v", pass: "q", at: 5 }];
const pw2 = [{ id: "a", site: "x.com", user: "u", pass: "p2", at: 9 }, { id: "c", site: "z.com", user: "w", pass: "r", at: 2 }];
assert.deepStrictEqual(ld.mergePasswords(pw, pw2), js.mergePasswords(pw, pw2));
assert.deepStrictEqual(ld.union(["a", "b"], ["b", "c"]), js.union(["a", "b"], ["b", "c"]));
assert.deepStrictEqual(ld.union(["a", "b"], ["b", "c"], 2), js.union(["a", "b"], ["b", "c"], 2));
const sc = [{ title: "A", url: "https://a.example" }], sc2 = [{ title: "B", url: "https://b.example" }, { title: "A2", url: "https://a.example" }];
assert.deepStrictEqual(ld.mergeShortcuts(sc, sc2), js.mergeShortcuts(sc, sc2));
const notes = [{ id: "n1", text: "hi", at: 1 }], notes2 = [{ id: "n1", text: "hello", at: 2 }, { id: "n2", text: "x", at: 3 }];
assert.deepStrictEqual(ld.mergeNotes(notes, notes2), js.mergeNotes(notes, notes2));
assert.deepStrictEqual(ld.notesForSync(notes2), js.notesForSync(notes2));
assert.deepStrictEqual(ld.pickSettings({ theme: "light", x: 1 }, { theme: "dark" }), js.pickSettings({ theme: "light", x: 1 }, { theme: "dark" }));
console.log("ok");
