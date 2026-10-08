/** 测试 fixture：启动 Electron + 连接 stub 游戏页面。端口随机，避免测试文件并行冲突。 */
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { connect, type Browser, type Page } from "puppeteer-core";
import { closeCdp, launchElectron } from "../src/index.ts";

export interface ElectronFixture {
  browser: Browser;
  page: Page;
  proc: ChildProcess;
  close: () => Promise<void>;
}

export async function launchFixture(): Promise<ElectronFixture> {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
  const appDir = path.resolve(import.meta.dirname, "../spike/app");
  const port = 9400 + Math.floor(Math.random() * 500);
  const session = await launchElectron((url) => connect({ browserURL: url, defaultViewport: null }) as Promise<unknown>, {
    electronPath: electronExe,
    appDir,
    port,
  });
  const browser = session.browser as Browser;
  // 页面可能还在加载（URL 尚未变为 fixture.html），轮询等待
  const deadline = Date.now() + 10_000;
  let page: Page | undefined;
  while (Date.now() < deadline) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes("fixture.html"));
    if (page) break;
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 200);
    await promise;
  }
  if (!page) {
    session.proc.kill();
    throw new Error("fixture 页面未找到");
  }
  return {
    browser,
    page,
    proc: session.proc,
    close: () =>
      closeCdp(session, async (b) => {
        try {
          await (b as Browser).close();
        } catch {
          // 已断连
        }
      }),
  };
}
