"use strict";
// Accent colour of the Linux desktop (KDE kdeglobals, GNOME gsettings). Null elsewhere or when unknown.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const GNOME = { blue: "#3584e4", teal: "#2190a4", green: "#3a944a", yellow: "#c88800", orange: "#ed5b00", red: "#e62d42", pink: "#d56199", purple: "#9141ac", slate: "#6f8396" };
const hex = (r, g, b) => "#" + [r, g, b].map(n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0")).join("");

function kde() {
  const f = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "kdeglobals");
  const txt = fs.readFileSync(f, "utf8");
  let sec = "", accent = null, sel = null;
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\[(.+)\]$/.exec(line.trim());
    if (m) { sec = m[1]; continue; }
    const kv = /^(\w+)=(\d+),(\d+),(\d+)/.exec(line.trim());
    if (!kv) continue;
    if (sec === "General" && kv[1] === "AccentColor") accent = hex(+kv[2], +kv[3], +kv[4]);
    if (sec === "Colors:Selection" && kv[1] === "BackgroundNormal") sel = hex(+kv[2], +kv[3], +kv[4]);
  }
  return accent || sel;
}

function gnome() {
  const out = execFileSync("gsettings", ["get", "org.gnome.desktop.interface", "accent-color"], { encoding: "utf8", timeout: 1500 });
  return GNOME[out.replace(/['\s]/g, "")] || null;
}

function systemAccent() {
  if (process.platform !== "linux") return null;
  for (const f of [kde, gnome]) { try { const c = f(); if (c) return c; } catch {} }
  return null;
}

module.exports = { systemAccent };
