"use strict";
// Dark/light preference of the Linux desktop for setups where Chromium cannot see it (Hyprland, Sway, i3, KDE without the GTK portal, ...).
// Sources, first answer wins: xdg-desktop-portal, GNOME gsettings, KDE kdeglobals, GTK settings.ini, GTK_THEME. Null when unknown.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const cfg = () => process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
const run = (cmd, args) => new Promise(res => execFile(cmd, args, { encoding: "utf8", timeout: 1500 }, (e, out) => res(e ? "" : String(out))));
const byName = n => (/dark|black|night/i.test(n) ? "dark" : n ? "light" : null);

async function portal() {
  const out = await run("gdbus", ["call", "--session", "--dest", "org.freedesktop.portal.Desktop", "--object-path", "/org/freedesktop/portal/desktop",
    "--method", "org.freedesktop.portal.Settings.Read", "org.freedesktop.appearance", "color-scheme"]);
  const m = /uint32 (\d)/.exec(out);
  return m ? (m[1] === "1" ? "dark" : m[1] === "2" ? "light" : null) : null; // 0 = no preference
}

async function gnome() {
  const cs = (await run("gsettings", ["get", "org.gnome.desktop.interface", "color-scheme"])).replace(/['\s]/g, "");
  if (cs === "prefer-dark") return "dark";
  if (cs === "prefer-light") return "light";
  return byName((await run("gsettings", ["get", "org.gnome.desktop.interface", "gtk-theme"])).replace(/['\s]/g, ""));
}

function kde() {
  const txt = fs.readFileSync(path.join(cfg(), "kdeglobals"), "utf8");
  const look = /^LookAndFeelPackage=(.+)$/m.exec(txt), scheme = /^ColorScheme=(.+)$/m.exec(txt);
  const n = (scheme && scheme[1]) || (look && look[1]) || "";
  if (n) return byName(n);
  const bg = /^\[Colors:Window\][^[]*?^BackgroundNormal=(\d+),(\d+),(\d+)/m.exec(txt);
  return bg ? ((+bg[1] * 299 + +bg[2] * 587 + +bg[3] * 114) / 1000 < 128 ? "dark" : "light") : null;
}

function gtk() {
  for (const v of ["gtk-4.0", "gtk-3.0"]) {
    try {
      const txt = fs.readFileSync(path.join(cfg(), v, "settings.ini"), "utf8");
      if (/^gtk-application-prefer-dark-theme\s*=\s*(1|true)/mi.test(txt)) return "dark";
      const t = /^gtk-theme-name\s*=\s*(.+)$/mi.exec(txt);
      if (t) return byName(t[1].trim());
    } catch {}
  }
  return null;
}

const env = () => byName(process.env.GTK_THEME || "");

/** "dark" | "light" | null */
async function systemScheme() {
  if (process.platform !== "linux") return null;
  for (const f of [portal, gnome, kde, gtk, env]) { try { const r = await f(); if (r) return r; } catch {} }
  return null;
}

/** Applies the desktop scheme to nativeTheme so `prefers-color-scheme` follows it; re-checks every few seconds. */
function follow(nativeTheme, onChange) {
  if (process.platform !== "linux") return () => {};
  let last;
  const tick = async () => {
    const s = await systemScheme();
    if (s === last) return;
    last = s;
    nativeTheme.themeSource = s || "system";
    if (onChange) onChange(s);
  };
  tick();
  const t = setInterval(tick, 4000);
  t.unref?.();
  return () => clearInterval(t);
}

module.exports = { systemScheme, follow };
