"use strict";
// Community theme plugins: a folder in <userData>/plugins/<id>/ with plugin.json and an optional CSS file.
//   plugin.json: { "name": "...", "author": "...", "version": "1.0.0", "description": "...", "vars": { "--bg": "#101010" }, "css": "theme.css" }
// No scripts run. A plugin can only set CSS custom properties and add a stylesheet for the browser UI.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const dir = () => path.join(app.getPath("userData"), "plugins");
const ID = /^[\w.-]{1,64}$/;
const VAR = /^--[\w-]{1,40}$/;
const VALUE = /^[^;{}<>\\]{1,200}$/;
const MAX_CSS = 200 * 1024;
// Stylesheets may not load anything from the network or other files.
const unsafeCss = (css) => /@import|url\s*\(\s*['"]?\s*(https?:|file:|\/\/)|expression\s*\(|javascript:/i.test(css);

function read(id) {
  if (!ID.test(id)) return null;
  try {
    const root = path.join(dir(), id);
    const m = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
    const vars = {};
    for (const [k, v] of Object.entries(m.vars || {})) if (VAR.test(k) && typeof v === "string" && VALUE.test(v)) vars[k] = v;
    let css = "";
    if (typeof m.css === "string" && /^[\w.-]+\.css$/.test(m.css)) {
      const f = path.join(root, m.css);
      if (fs.statSync(f).size <= MAX_CSS) css = fs.readFileSync(f, "utf8");
      if (unsafeCss(css)) css = "";
    }
    const s = (x, n) => String(x || "").slice(0, n);
    return { id, name: s(m.name, 60) || id, author: s(m.author, 60), version: s(m.version, 20), description: s(m.description, 200), vars, css };
  } catch { return null; }
}

function list() {
  try { return fs.readdirSync(dir()).map(read).filter(Boolean); } catch { return []; }
}

/** The plugin with this id, or null. */
const get = (id) => (id ? read(String(id)) : null);

/** Makes sure the plugins folder exists and returns its path. */
function folder() {
  fs.mkdirSync(dir(), { recursive: true });
  return dir();
}

module.exports = { list, get, folder };
