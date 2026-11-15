"use strict";
// Keyboard shortcut table. Combos are strings like "Ctrl+Shift+T": modifiers in the
// order Ctrl, Alt, Shift, then the key (letters upper-case, names as reported by the
// browser, e.g. PageDown, ArrowLeft, F12). Meta counts as Ctrl.

const ACTIONS = [
  { id: "newTab", label: "New tab", def: ["Ctrl+T"] },
  { id: "newPrivate", label: "New private tab", def: ["Ctrl+Shift+N"] },
  { id: "undoClose", label: "Reopen closed tab", def: ["Ctrl+Shift+T"] },
  { id: "closeTab", label: "Close tab", def: ["Ctrl+W"] },
  { id: "nextTab", label: "Next tab", def: ["Ctrl+PageDown"] },
  { id: "prevTab", label: "Previous tab", def: ["Ctrl+PageUp"] },
  { id: "switcher", label: "Tab switcher", def: ["Ctrl+Tab", "Ctrl+Shift+A"] },
  { id: "address", label: "Address bar", def: ["Ctrl+L", "F6", "Alt+D"] },
  { id: "find", label: "Find in page", def: ["Ctrl+F"] },
  { id: "reload", label: "Reload", def: ["Ctrl+R", "F5"] },
  { id: "hardReload", label: "Reload, skip cache", def: ["Ctrl+Shift+R", "Shift+F5"] },
  { id: "back", label: "Back", def: ["Alt+ArrowLeft"] },
  { id: "forward", label: "Forward", def: ["Alt+ArrowRight"] },
  { id: "menu", label: "Menu", def: ["Ctrl+M", "Alt+F", "Alt+E"] },
  { id: "settings", label: "Settings", def: ["Ctrl+,"] },
  { id: "history", label: "History", def: ["Ctrl+H"] },
  { id: "downloads", label: "Downloads", def: ["Ctrl+J"] },
  { id: "notebook", label: "Notebook", def: ["Ctrl+Shift+O"] },
  { id: "devtools", label: "Developer tools", def: ["F12"] },
  { id: "chat", label: "Server chat", def: ["Ctrl+Shift+K"] },
  { id: "assistant", label: "Ask AI about this page", def: ["Ctrl+Shift+L"] },
  { id: "osk", label: "On-screen keyboard", def: ["Ctrl+Alt+K"] },
  { id: "toggleVertical", label: "Vertical tabs on/off", def: ["Ctrl+Shift+V"] },
  { id: "toggleSplit", label: "Split view on/off", def: ["Ctrl+Shift+S"] },
  { id: "draw", label: "Draw on tab", def: ["Ctrl+Shift+D"] },
  { id: "move", label: "Move page part", def: ["Ctrl+Shift+M"] },
];

const MODS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph"]);

// e: { key, ctrl, alt, shift }. Returns "" for a bare modifier.
function comboJs(e) {
  let k = String(e.key == null ? "" : e.key);
  if (!k || MODS.has(k)) return "";
  if (k === " ") k = "Space";
  else if (k.length === 1) k = k.toUpperCase();
  return (e.ctrl ? "Ctrl+" : "") + (e.alt ? "Alt+" : "") + (e.shift ? "Shift+" : "") + k;
}

const fromInput = i => !i ? "" : module.exports.combo({ key: i.key, ctrl: i.control || i.meta, alt: i.alt, shift: i.shift });
const fromEvent = e => !e ? "" : module.exports.combo({ key: e.key, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey });

const validJs = c => typeof c === "string" && /^(Ctrl\+)?(Alt\+)?(Shift\+)?[^+\s]+$|^(Ctrl\+)?(Alt\+)?(Shift\+)?\+$/.test(c) && c.length < 40 && !/(^|\+)(Ctrl|Alt|Shift|Meta|Dead|Unidentified)$/.test(c);

// Effective combos per action: user override (even an empty list) wins over the default.
function effective(over) {
  const o = over && typeof over === "object" ? over : {};
  const out = {};
  for (const a of ACTIONS) out[a.id] = Array.isArray(o[a.id]) ? o[a.id].filter(valid) : a.def.slice();
  return out;
}

// combo -> action id (first action in table order wins on a clash).
function mapJs(over) {
  const eff = effective(over), m = {};
  for (const a of ACTIONS) for (const c of eff[a.id]) if (!(c in m)) m[c] = a.id;
  return m;
}

// New override object after binding `combos` to `id`: they are taken off every other action.
function bindJs(over, id, combos) {
  if (!ACTIONS.some(a => a.id === id)) return over;
  const mine = [...new Set((Array.isArray(combos) ? combos : []).filter(valid))];
  const eff = effective(over), next = {};
  for (const a of ACTIONS) {
    if (a.id === id) next[a.id] = mine;
    else {
      const rest = eff[a.id].filter(c => !mine.includes(c));
      if (rest.length !== eff[a.id].length || (over && Array.isArray(over[a.id]))) next[a.id] = rest;
    }
  }
  return next;
}

function listJs(over) {
  const eff = effective(over);
  return ACTIONS.map(a => ({ id: a.id, label: a.label, keys: eff[a.id], def: a.def }));
}

// Rust core does the work when the addon is loaded; the JS originals stay as fallback and for parity tests.
const rs = require("./native").call;
const combo = rs ? e => rs("keys:combo", { key: String(e.key == null ? "" : e.key), ctrl: !!e.ctrl, alt: !!e.alt, shift: !!e.shift }) : comboJs;
const valid = rs ? c => typeof c === "string" && rs("keys:valid", { combo: c }) : validJs;
const map = rs ? over => rs("keys:map", { overrides: over || {} }) : mapJs;
const bind = rs ? (over, id, combos) => rs("keys:bind", { overrides: over || {}, id: String(id), combos: Array.isArray(combos) ? combos : [] }) : bindJs;
const list = rs ? over => rs("keys:list", { overrides: over || {} }) : listJs;

module.exports = { ACTIONS, combo, fromInput, fromEvent, valid, effective, map, bind, list, _js: { combo: comboJs, valid: validJs, map: mapJs, bind: bindJs, list: listJs } };
