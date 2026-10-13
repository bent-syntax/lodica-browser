// Bridge for the bar UI (ui/): invoke commands and listen to events from the main process.
const { contextBridge, ipcRenderer } = require("electron");

const subs = new Map();
ipcRenderer.on("ui-event", (_, ev, data) => {
  for (const fn of subs.get(ev) || []) {
    try { fn(data); } catch (e) { console.error(ev, e); }
  }
});

contextBridge.exposeInMainWorld("lodica", {
  invoke: (cmd, ...args) => ipcRenderer.invoke("ui", cmd, ...args),
  on: (event, fn) => {
    if (typeof fn !== "function") return;
    if (!subs.has(event)) subs.set(event, []);
    subs.get(event).push(fn);
  },
});
