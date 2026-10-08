// P0/P3 的 Electron 主进程：隐藏窗口加载游戏页面。
// 页面来源：RM_GAME_URL 环境变量（真实 MV/MZ 工程 index.html）或默认 stub fixture。
const { app, BrowserWindow } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 816,
    height: 624,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true },
  });
  const target = process.env.RM_GAME_URL ?? pathToFileURL(path.join(__dirname, "fixture.html")).href;
  win.loadURL(target);
});

// 保持进程存活，由外部驱动（CDP）并负责终止
app.on("window-all-closed", () => {});
