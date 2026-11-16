"use strict";
// Colours of the Linux desktop for the "System" theme. Sources, first answer wins:
//   Oxide (~/.config/oxide/theme.json: full palette), pywal / wallust / matugen colour files (full palette),
//   Hyprland (active border colour = accent), KDE kdeglobals (accent), GNOME gsettings (accent).
// Desktop-specific files are only trusted while that desktop runs, so an old KDE config cannot override Oxide or Hyprland.
// Returns { accent, bg?, raised?, line?, text?, muted?, light? } or null.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const GNOME = { blue: "#3584e4", teal: "#2190a4", green: "#3a944a", yellow: "#c88800", orange: "#ed5b00", red: "#e62d42", pink: "#d56199", purple: "#9141ac", slate: "#6f8396" };
const hex = (r, g, b) => "#" + [r, g, b].map(n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0")).join("");
const six = (c) => { const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(c || "").trim()); return m ? "#" + m[1].toLowerCase() : null; };
const cfgDir = () => process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
const cacheDir = () => process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
const desk = () => String(process.env.XDG_CURRENT_DESKTOP || "") + ":" + String(process.env.XDG_SESSION_DESKTOP || "") + ":" + String(process.env.DESKTOP_SESSION || "");
const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

/** Keeps only valid colours, so a broken file never paints the UI. Without bg and text it is an accent only. */
function clean(p) {
  if (!p || !six(p.accent)) return null;
  const out = { accent: six(p.accent) };
  for (const k of ["bg", "raised", "line", "text", "muted"]) if (six(p[k])) out[k] = six(p[k]);
  if (!out.bg || !out.text) return { accent: out.accent };
  out.light = typeof p.light === "boolean" ? p.light : lum(out.bg) > 0.5;
  return out;
}

function oxide() {
  if (!/oxide/i.test(desk())) return null;
  const t = JSON.parse(fs.readFileSync(path.join(cfgDir(), "oxide", "theme.json"), "utf8"));
  return clean({ accent: t.accent, bg: t.bg, raised: t.surface || t.raised, line: t.line, text: t.text, muted: t.muted, light: t.light });
}

// pywal, wallust (pywal format) and matugen's pywal template write the same file.
function wal() {
  const t = JSON.parse(fs.readFileSync(path.join(cacheDir(), "wal", "colors.json"), "utf8"));
  const s = t.special || {}, c = t.colors || {};
  return clean({ accent: c.color4 || c.color2, bg: s.background, raised: c.color0, text: s.foreground, muted: c.color8 });
}

function hyprland() {
  if (!process.env.HYPRLAND_INSTANCE_SIGNATURE) return null;
  const out = execFileSync("hyprctl", ["getoption", "general:col.active_border"], { encoding: "utf8", timeout: 1000 });
  const m = /\b(?:0x)?([0-9a-f]{2})([0-9a-f]{6})\b/i.exec(out.replace(/^.*?:/s, ""));
  return m ? clean({ accent: "#" + m[2] }) : null;
}

function kde() {
  if (!/kde|plasma/i.test(desk())) return null;
  const txt = fs.readFileSync(path.join(cfgDir(), "kdeglobals"), "utf8");
  let sec = "", accent = null, sel = null;
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\[(.+)\]$/.exec(line.trim());
    if (m) { sec = m[1]; continue; }
    const kv = /^(\w+)=(\d+),(\d+),(\d+)/.exec(line.trim());
    if (!kv) continue;
    if (sec === "General" && kv[1] === "AccentColor") accent = hex(+kv[2], +kv[3], +kv[4]);
    if (sec === "Colors:Selection" && kv[1] === "BackgroundNormal") sel = hex(+kv[2], +kv[3], +kv[4]);
  }
  return clean({ accent: accent || sel });
}

function gnome() {
  const out = execFileSync("gsettings", ["get", "org.gnome.desktop.interface", "accent-color"], { encoding: "utf8", timeout: 1500 });
  return clean({ accent: GNOME[out.replace(/['\s]/g, "")] });
}

function systemPalette() {
  if (process.platform !== "linux") return null;
  for (const f of [oxide, wal, hyprland, kde, gnome]) { try { const c = f(); if (c) return c; } catch {} }
  return null;
}

function systemAccent() { const p = systemPalette(); return p ? p.accent : null; }

// Live: the palette is read again every few seconds (a few small file reads), so a theme switch shows without a restart.
let cur, timer = null;
const subs = new Set();
function current() { if (cur === undefined) cur = systemPalette(); return cur; }
function watch(fn) {
  subs.add(fn);
  if (!timer && process.platform === "linux") {
    timer = setInterval(() => {
      const next = systemPalette();
      if (JSON.stringify(next) === JSON.stringify(cur)) return;
      cur = next;
      for (const f of subs) { try { f(cur); } catch {} }
    }, 4000);
    timer.unref?.();
  }
  return () => subs.delete(fn);
}

module.exports = { systemAccent, systemPalette, current, watch };
