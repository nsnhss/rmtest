/**
 * P0 验证线 2：Electron(Chromium) + CDP 驱动事件解释器。
 * 运行：pnpm spike:runtime
 */
import path from "node:path";
import assert from "node:assert/strict";
import { connect, type Browser } from "puppeteer-core";
import { closeCdp, launchElectron } from "../src/cdp.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
const appDir = path.resolve(import.meta.dirname, "app");

// MV 事件序列：显示文本 → 开开关 12 → 传送到地图 2 (5,5)
const eventList = [
  { code: 101, indent: 0, parameters: ["", 0, 0, 2] },
  { code: 401, indent: 1, parameters: ["你好，世界"] },
  { code: 121, indent: 0, parameters: [12, 12, 0] },
  { code: 201, indent: 0, parameters: [2, 5, 5, 0, 0] },
  { code: 0, indent: 0, parameters: [] },
];

const session = await launchElectron((url) => connect({ browserURL: url }) as Promise<unknown>, {
  electronPath: electronExe,
  appDir,
});

try {
  const browser = session.browser as Browser;
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes("fixture.html"));
  assert.ok(page, "fixture 页面未找到");

  // 页面契约：fixture.html 暴露的 __spike 表面（页面上下文类型，主进程侧无此类型）
  interface SpikePage {
    __spike: {
      reset: () => unknown;
      runEvent: (l: unknown, id: number) => unknown;
    };
  }

  const result = await page.evaluate((list) => {
    const pageWindow = window as unknown as SpikePage; // 页面上下文：window 形状由 fixture.html 定义
    pageWindow.__spike.reset();
    return pageWindow.__spike.runEvent(list, 1);
  }, eventList) as {
    finished: boolean;
    eventId: number;
    switch12: boolean;
    switch2: boolean;
    transfer: { mapId: number; x: number; y: number } | null;
  };

  assert.equal(result.eventId, 1, "事件 ID 应注入解释器");
  assert.equal(result.finished, true, "解释器应跑到事件结束");
  assert.equal(result.switch12, true, "Control Switches 应把开关 12 置 ON");
  assert.equal(result.switch2, false, "无关开关 2 应保持 OFF");
  assert.deepEqual(result.transfer, { mapId: 2, x: 5, y: 5 }, "Transfer Player 应写入传送目标");

  console.log("事件序列执行结果:", JSON.stringify(result));
  console.log("SPIKE OK: runtime");
} finally {
  await closeCdp(session, async (b) => {
    try {
      await (b as Browser).close();
    } catch {
      // 忽略
    }
  });
}
