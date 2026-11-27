"use strict";
// Global copy: Ctrl+Alt+C copies the selection in whatever app is in front, also when Lodica has no focus.
// A shortcut cannot read another app's selection, so it releases the held keys and sends that app a real Ctrl+C.
const { app, globalShortcut, Notification, clipboard, webContents } = require("electron");
const { execFile } = require("child_process");

const KEY = "CommandOrControl+Alt+C";

// Alt and Shift are still down from the shortcut; lift them first so the app sees a plain Ctrl+C. Both Alt keys (AltGr is
// Ctrl+Alt), both Shift keys and the right Ctrl go up; the key presses carry scan codes, which some apps read instead of the key code.
const WIN = "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class K{[DllImport(\"user32.dll\")]public static extern void keybd_event(byte v,byte s,uint f,UIntPtr e);}';" +
  "$z=[UIntPtr]::Zero;foreach($k in 0xA4,0xA5,0xA0,0xA1,0xA3){[K]::keybd_event($k,0,2,$z)};Start-Sleep -Milliseconds 80;" +
  "[K]::keybd_event(0xA2,0x1D,0,$z);[K]::keybd_event(0x43,0x2E,0,$z);" +
  "[K]::keybd_event(0x43,0x2E,2,$z);[K]::keybd_event(0xA2,0x1D,2,$z)";
// -EncodedCommand (UTF-16LE base64) avoids every command-line quoting rule.
const WIN_ARGS = ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(WIN, "utf16le").toString("base64")];

function sendCopy() {
  return new Promise((res) => {
    const done = (e) => res(e ? String(e.message || e).split("\n")[0] : "");
    if (process.platform === "win32") execFile("powershell", WIN_ARGS, { timeout: 8000, windowsHide: true }, done);
    else if (process.platform === "linux") execFile("xdotool", ["key", "--clearmodifiers", "ctrl+c"], { timeout: 3000 }, done);
    else res("unsupported platform");
  });
}

const notify = (title, body) => { try { new Notification({ title, body: String(body || "").slice(0, 80), silent: true }).show(); } catch { /* no notifications */ } };

async function copy() {
  // Lodica itself in front: copy through the page, no key faking needed.
  const own = webContents.getFocusedWebContents();
  if (own && !own.isDestroyed()) {
    own.copy();
    await new Promise((r) => setTimeout(r, 80));
    const t = clipboard.readText();
    notify(t ? "Copied" : "Nothing selected", t);
    return;
  }
  const before = clipboard.readText();
  clipboard.writeText(""); // an empty clipboard afterwards means nothing was selected
  const err = await sendCopy();
  if (err) { clipboard.writeText(before); notify("Could not copy", err); return; }
  let text = "";
  for (let i = 0; i < 10 && !text; i++) { await new Promise((r) => setTimeout(r, 60)); text = clipboard.readText(); }
  if (!text) clipboard.writeText(before);
  notify(text ? "Copied" : "Nothing selected", text);
}

function init() {
  let ok = false;
  try { ok = globalShortcut.register(KEY, () => { copy().catch(() => {}); }); } catch { /* taken by another app */ }
  if (!ok) console.error("global copy shortcut unavailable");
  app.on("will-quit", () => globalShortcut.unregister(KEY));
}

module.exports = { init, KEY };
