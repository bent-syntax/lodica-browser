"use strict";
// OS-level input for Phone -> PC control. Browser DOM input cannot move the cursor outside Electron, so Linux uses xdotool and
// Windows uses a short PowerShell script with user32 calls. The command builders are pure and the runner is injectable.
const { execFile } = require("child_process");

const LINUX_KEYS = {
  back: "Escape", home: "Home", enter: "Return", escape: "Escape", tab: "Tab", space: "space",
  backspace: "BackSpace", delete: "Delete", left: "Left", right: "Right", up: "Up", down: "Down",
};
const WIN_KEYS = {
  back: 0x1B, home: 0x24, enter: 0x0D, escape: 0x1B, tab: 0x09, space: 0x20,
  backspace: 0x08, delete: 0x2E, left: 0x25, right: 0x27, up: 0x26, down: 0x28,
};
const point = (e, w, h) => [Math.max(0, Math.min(w, Math.round(Number(e.x || 0) * w))), Math.max(0, Math.min(h, Math.round(Number(e.y || 0) * h)))];
const end = (e, w, h) => [Math.max(0, Math.min(w, Math.round(Number(e.x2 || 0) * w))), Math.max(0, Math.min(h, Math.round(Number(e.y2 || 0) * h)))];

/** Linux xdotool argv for one event, or null when the event is unsupported. */
function linuxArgs(e, w, h) {
  if (!e || typeof e !== "object") return null;
  if (e.t === "tap" || e.t === "right") {
    const [x, y] = point(e, w, h);
    return ["mousemove", String(x), String(y), "click", e.t === "right" ? "3" : "1"];
  }
  if (e.t === "move") { const [x, y] = end(e, w, h); return ["mousemove", String(x), String(y)]; }
  if (e.t === "swipe") {
    const [x, y] = point(e, w, h), [x2, y2] = end(e, w, h);
    return ["mousemove", String(x), String(y), "mousedown", "1", "mousemove", String(x2), String(y2), "mouseup", "1"];
  }
  if (e.t === "scroll") {
    const [x, y] = point(e, w, h);
    const n = Math.max(1, Math.min(10, Math.abs(Number(e.steps) || 1)));
    return ["mousemove", String(x), String(y), "click", "--repeat", String(n), String(Number(e.steps) < 0 ? 4 : 5)];
  }
  if (e.t === "key") {
    const k = LINUX_KEYS[String(e.key || "").toLowerCase()];
    return k ? ["key", "--clearmodifiers", k] : null;
  }
  if (e.t === "text") {
    const s = String(e.text || "").slice(0, 500);
    return s ? ["type", "--clearmodifiers", "--delay", "12", "--", s] : null;
  }
  return null;
}

const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Windows PowerShell script for one event, or null when unsupported. */
function windowsScript(e, w, h) {
  if (!e || typeof e !== "object") return null;
  const move = (x, y) => `[User32]::SetCursorPos(${x},${y})`;
  const mouse = (flags) => `[User32]::mouse_event(0x${flags.toString(16)},0,0,0,0)`;
  if (e.t === "tap" || e.t === "right" || e.t === "swipe") {
    const [x, y] = point(e, w, h);
    const down = e.t === "right" ? 0x08 : 0x02, up = e.t === "right" ? 0x10 : 0x04;
    let script = move(x, y) + ";" + mouse(down);
    if (e.t === "swipe") { const [x2, y2] = end(e, w, h); script += ";" + move(x2, y2); }
    return script + ";" + mouse(up);
  }
  if (e.t === "move") { const [x, y] = end(e, w, h); return move(x, y); }
  if (e.t === "scroll") {
    const [x, y] = point(e, w, h), n = Math.max(1, Math.min(10, Math.abs(Number(e.steps) || 1)));
    return `$n=${n};` + move(x, y) + ";1..\$n | ForEach-Object { " + mouse(Number(e.steps) < 0 ? 0x0800 : 0x0400) + " }";
  }
  if (e.t === "key") {
    const code = WIN_KEYS[String(e.key || "").toLowerCase()];
    return code ? `[User32]::keybd_event([byte]0x${code.toString(16)},0,0,0);[User32]::keybd_event([byte]0x${code.toString(16)},0,2,0)` : null;
  }
  if (e.t === "text") {
    const s = String(e.text || "").slice(0, 500);
    return s ? `Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait(${psQuote(s)})` : null;
  }
  return null;
}

const defaultRunner = (command, args, options) => new Promise((resolve, reject) => {
  execFile(command, args, { windowsHide: true, timeout: 10000, ...options }, (err, stdout) => err ? reject(err) : resolve(stdout));
});

function create(opts = {}) {
  const runner = opts.runner || defaultRunner;
  const platform = opts.platform || process.platform;
  const sizeOf = opts.size || (() => {
    try {
      const { screen } = require("electron");
      const s = screen.getPrimaryDisplay();
      return { width: s.size.width, height: s.size.height };
    } catch { return { width: 1920, height: 1080 }; }
  });
  return {
    platform,
    commandFor(e, width, height) {
      const { width: w, height: h } = sizeOf();
      const W = width || w, H = height || h;
      return platform === "win32" ? windowsScript(e, W, H) : platform === "linux" ? linuxArgs(e, W, H) : null;
    },
    async apply(events) {
      if (!Array.isArray(events)) return 0;
      let done = 0;
      for (const e of events) {
        const command = this.commandFor(e);
        if (!command) continue;
        try {
          if (platform === "win32") await runner("powershell", ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop';Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class User32{[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int X,int Y);[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);[DllImport(\"user32.dll\")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);}';" + command]);
          else await runner("xdotool", command);
          done++;
        } catch { /* a stale event or missing helper must not stop the stream */ }
      }
      return done;
    },
  };
}

module.exports = { create, linuxArgs, windowsScript, LINUX_KEYS, WIN_KEYS };
