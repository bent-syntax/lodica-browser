"use strict";
// Community theme plugins: a folder in <userData>/plugins/<id>/ with plugin.json and an optional CSS file.
//   plugin.json: { "name": "...", "author": "...", "version": "1.0.0", "description": "...", "vars": { "--bg": "#101010" }, "css": "theme.css" }
// "animations" adds validated keyframe animations (see animationCss). No scripts run. A plugin can only set CSS custom properties and add a stylesheet for the browser UI.
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

// Animations: { "name": { "target": "tab", "duration": 600, "iterations": 1, "keyframes": { "0%": { "opacity": "0" }, "100%": { "opacity": "1" } } } }
// They compile to plain @keyframes and a rule for one fixed target, so a plugin cannot reach any other element.
const ANIM_TARGETS = { tab: ".t", "current-tab": ".t.cur", window: "body" };
const START_TARGETS = { logo: ".mark", "start-page": "body" }; // these run on the start page only
const ANIM_PROPS = new Set(["opacity", "transform", "filter", "background-color", "color", "border-color", "box-shadow"]);
const ANIM_VALUE = /^[\w\s.,%#()+\-/]{1,120}$/;
const ANIM_NAME = /^[a-z][\w-]{0,30}$/i;
function animationCss(anims, targets = ANIM_TARGETS) {
  if (!anims || typeof anims !== "object") return "";
  let out = "";
  for (const [name, a] of Object.entries(anims).slice(0, 8)) {
    const sel = a && targets[a.target];
    if (!ANIM_NAME.test(name) || !sel || !a.keyframes || typeof a.keyframes !== "object") continue;
    let frames = "";
    for (const [at, props] of Object.entries(a.keyframes).slice(0, 12)) {
      if (!/^(\d{1,3}(\.\d+)?%|from|to)$/.test(at) || !props || typeof props !== "object") continue;
      const body = Object.entries(props).filter(([k, v]) => ANIM_PROPS.has(k) && typeof v === "string" && ANIM_VALUE.test(v)).map(([k, v]) => k + ":" + v).join(";");
      if (body) frames += at + "{" + body + "}";
    }
    if (!frames) continue;
    const ms = Math.min(Math.max(Math.round(Number(a.duration)) || 400, 50), 10000);
    const n = a.iterations === "infinite" ? "infinite" : Math.min(Math.max(Math.round(Number(a.iterations)) || 1, 1), 10);
    out += "@keyframes pl-" + name + "{" + frames + "}" + sel + "{animation:pl-" + name + " " + ms + "ms ease " + n + "}";
  }
  return out ? "@media (prefers-reduced-motion:no-preference){" + out + "}" : "";
}

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
    css += animationCss(m.animations);
    const startCss = animationCss(m.animations, START_TARGETS);
    const s = (x, n) => String(x || "").slice(0, n);
    return { id, name: s(m.name, 60) || id, author: s(m.author, 60), version: s(m.version, 20), description: s(m.description, 200), vars, css, startCss };
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

module.exports = { list, get, folder, animationCss };
