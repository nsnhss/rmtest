// P0 spike 的 Electron 主进程：隐藏窗口加载 fixture 页面。
const { app, BrowserWindow } = require("electron");
const path = require("path");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 816,
    height: 624,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true },
  });
  win.loadFile(path.join(__dirname, "fixture.html"));
});

// 保持进程存活，由外部驱动（CDP）并负责终止
app.on("window-all-closed", () => {});
