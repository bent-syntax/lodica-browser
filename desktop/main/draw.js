"use strict";
// Drawings and moved page spots, saved per page address so they come back after a reload or reopening the tab.
const { ipcMain } = require("electron");
const store = require("./store");

const MAX_KEYS = 500, MAX_BYTES = 400000;
let data = null;
const all = () => data || (data = store.load("drawings", {}));

function init({ tabs }) {
  const normal = e => { const t = tabs.byContents(e.sender); return !!t && !t.private; };
  ipcMain.on("drawLoad", (e, key) => {
    const d = typeof key === "string" && normal(e) ? all()[key] : null;
    e.returnValue = d || { strokes: [], moves: [] };
  });
  ipcMain.on("drawSave", (e, key, d) => {
    if (typeof key !== "string" || key.length > 2000 || !d || !normal(e)) return;
    const a = all();
    const clean = { strokes: Array.isArray(d.strokes) ? d.strokes : [], moves: Array.isArray(d.moves) ? d.moves : [] };
    if (JSON.stringify(clean).length > MAX_BYTES) return;
    if (!clean.strokes.length && !clean.moves.length) delete a[key];
    else { delete a[key]; a[key] = clean; }
    for (const k of Object.keys(a).slice(0, Math.max(0, Object.keys(a).length - MAX_KEYS))) delete a[k];
    store.save("drawings", () => all());
  });
}

module.exports = { init };
