// Bridge for the emoji picker window.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("picker", {
  list: () => ipcRenderer.invoke("emojipicker:list"),
  copy: name => ipcRenderer.invoke("emojipicker:copy", name),
  onShow: fn => ipcRenderer.on("reload", () => fn()),
});
