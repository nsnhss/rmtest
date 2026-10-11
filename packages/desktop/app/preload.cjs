// 沙箱 preload：只暴露命令通道，不泄露任何 Node 能力
const { contextBridge, ipcRenderer } = require("electron");

// locale 作为各通道的最后一个可选参数，供主进程切换报告/文本语言（未传则沿用现有）
contextBridge.exposeInMainWorld("api", {
  scan: (dir, locale) => ipcRenderer.invoke("scan", dir, locale),
  maintain: (dir, corpusPath, apply, locale) => ipcRenderer.invoke("maintain", dir, corpusPath, apply, locale),
  content: (dir, baselinePath, locale) => ipcRenderer.invoke("content", dir, baselinePath, locale),
  aigen: (dir, nl, locale) => ipcRenderer.invoke("aigen", dir, nl, locale),
  corpusList: (dir, locale) => ipcRenderer.invoke("corpus-list", dir, locale),
  corpusAdd: (dir, scenarioPath, locale) => ipcRenderer.invoke("corpus-add", dir, scenarioPath, locale),
  regress: (dir, locale) => ipcRenderer.invoke("regress", dir, locale),
  coverage: (dir, locale) => ipcRenderer.invoke("coverage", dir, locale),
  trends: (dir, locale) => ipcRenderer.invoke("trends", dir, locale),
  fuzz: (dir, opts, locale) => ipcRenderer.invoke("fuzz", dir, opts, locale),
  goldenApprove: (dir, tag, locale) => ipcRenderer.invoke("golden-approve", dir, tag, locale),
  goldenCheck: (dir, tag, locale) => ipcRenderer.invoke("golden-check", dir, tag, locale),
  recordStart: (dir, locale) => ipcRenderer.invoke("record-start", dir, locale),
  recordStop: (locale) => ipcRenderer.invoke("record-stop", locale),
});
