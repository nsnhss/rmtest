// 沙箱 preload：只暴露命令通道，不泄露任何 Node 能力
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  scan: (dir) => ipcRenderer.invoke("scan", dir),
  maintain: (dir, corpusPath, apply) => ipcRenderer.invoke("maintain", dir, corpusPath, apply),
  content: (dir, baselinePath) => ipcRenderer.invoke("content", dir, baselinePath),
  aigen: (dir, nl) => ipcRenderer.invoke("aigen", dir, nl),
  corpusList: (dir) => ipcRenderer.invoke("corpus-list", dir),
  corpusAdd: (dir, scenarioPath) => ipcRenderer.invoke("corpus-add", dir, scenarioPath),
  regress: (dir) => ipcRenderer.invoke("regress", dir),
  coverage: (dir) => ipcRenderer.invoke("coverage", dir),
  trends: (dir) => ipcRenderer.invoke("trends", dir),
  fuzz: (dir, opts) => ipcRenderer.invoke("fuzz", dir, opts),
  goldenApprove: (dir, tag) => ipcRenderer.invoke("golden-approve", dir, tag),
  goldenCheck: (dir, tag) => ipcRenderer.invoke("golden-check", dir, tag),
  recordStart: (dir) => ipcRenderer.invoke("record-start", dir),
  recordStop: () => ipcRenderer.invoke("record-stop"),
});
