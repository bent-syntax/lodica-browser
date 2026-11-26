"use strict";
// Global copy: Ctrl+Alt+C copies the selection in whatever app is in front, also when Lodica has no focus.
// A shortcut cannot read another app's selection, so it releases the held keys and sends that app a real Ctrl+C.
const { app, globalShortcut, Notification, clipboard } = require("electron");
const { execFile } = require("child_process");

const KEY = "CommandOrControl+Alt+C";

// Alt and Shift are still down from the shortcut; lift them first so the app sees a plain Ctrl+C.
const WIN = "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class K{[DllImport(\"user32.dll\")]public static extern void keybd_event(byte v,byte s,uint f,UIntPtr e);}';" +
  "foreach($k in 0x12,0x10){[K]::keybd_event($k,0,2,[UIntPtr]::Zero)};" +
  "[K]::keybd_event(0x11,0,0,[UIntPtr]::Zero);[K]::keybd_event(0x43,0,0,[UIntPtr]::Zero);" +
  "[K]::keybd_event(0x43,0,2,[UIntPtr]::Zero);[K]::keybd_event(0x11,0,2,[UIntPtr]::Zero)";

function sendCopy() {
  return new Promise((res) => {
    const done = (e) => res(!e);
    if (process.platform === "win32") execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", WIN], { timeout: 5000, windowsHide: true }, done);
    else if (process.platform === "linux") execFile("xdotool", ["key", "--clearmodifiers", "ctrl+c"], { timeout: 3000 }, done);
    else res(false);
  });
}

async function copy() {
  const before = clipboard.readText();
  clipboard.writeText(""); // an empty clipboard afterwards means nothing was selected
  if (!(await sendCopy())) { clipboard.writeText(before); return; }
  let text = "";
  for (let i = 0; i < 10 && !text; i++) { await new Promise((r) => setTimeout(r, 60)); text = clipboard.readText(); }
  if (!text) clipboard.writeText(before);
  try { new Notification({ title: text ? "Copied" : "Nothing selected", body: text.slice(0, 80), silent: true }).show(); } catch { /* no notifications */ }
}

function init() {
  let ok = false;
  try { ok = globalShortcut.register(KEY, () => { copy().catch(() => {}); }); } catch { /* taken by another app */ }
  if (!ok) console.error("global copy shortcut unavailable");
  app.on("will-quit", () => globalShortcut.unregister(KEY));
}

module.exports = { init, KEY };
