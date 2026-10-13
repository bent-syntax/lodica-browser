if (location.protocol === "lodica:") {
const {contextBridge,ipcRenderer}=require("electron");contextBridge.exposeInMainWorld("browser",{runtime:{sendMessage:m=>ipcRenderer.invoke("search-msg",m)},extension:{inIncognitoContext:process.argv.includes("--lodica-private")}})
}
