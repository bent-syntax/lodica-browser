"use strict";
// Bridge for the circle-to-search overlay (main/circlesearch.js): the frozen screenshot in, the drawn region out.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cs", {
  onShot: (cb) => ipcRenderer.on("cs:shot", (_e, d) => cb(d)),
  run: (kind, rect) => ipcRenderer.invoke("cs:run", kind, rect),
  close: () => ipcRenderer.send("cs:close"),
});
