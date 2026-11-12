const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const handlers = {};
require.cache[require.resolve("electron")] = { id: "electron", filename: "electron", loaded: true, exports: { ipcMain: { on: (n, f) => { handlers[n] = f; } } } };
const saved = {};
const storePath = path.join(__dirname, "../main/store.js");
require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { load: () => saved, save: () => {} } };
const draw = require("../main/draw");

const run = (name, priv, ...args) => { const e = { sender: {}, returnValue: null }; handlers[name](e, ...args); return e.returnValue; };

test("drawings save and load per page, skip private tabs, clear when empty", () => {
  let priv = false;
  draw.init({ tabs: { byContents: () => ({ private: priv }) } });
  const d = { strokes: [{ c: "#fff", w: 4, p: [[1, 2]] }], moves: [{ s: "#a", x: 5, y: 6 }] };
  run("drawSave", false, "https://a.test/x", d);
  assert.deepStrictEqual(run("drawLoad", false, "https://a.test/x"), d);
  assert.deepStrictEqual(run("drawLoad", false, "https://a.test/y"), { strokes: [], moves: [] });
  run("drawSave", false, "https://a.test/x", { strokes: [], moves: [] });
  assert.strictEqual(saved["https://a.test/x"], undefined);
  priv = true;
  run("drawSave", true, "https://a.test/p", d);
  assert.strictEqual(saved["https://a.test/p"], undefined);
});
