// Bridge for the emoji picker window.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("picker", {
  list: () => ipcRenderer.invoke("emojipicker:list"),
  copy: name => ipcRenderer.invoke("emojipicker:copy", name),
  add: name => ipcRenderer.invoke("emojipicker:add", name),
  onShow: fn => ipcRenderer.on("reload", () => fn()),
});
