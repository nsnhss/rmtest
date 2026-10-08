// 沙箱 preload：只暴露三个命令通道，不泄露任何 Node 能力
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  scan: (dir) => ipcRenderer.invoke("scan", dir),
  maintain: (dir, corpusPath, apply) => ipcRenderer.invoke("maintain", dir, corpusPath, apply),
  content: (dir, baselinePath) => ipcRenderer.invoke("content", dir, baselinePath),
});
