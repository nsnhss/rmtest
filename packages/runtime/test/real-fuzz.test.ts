import type { Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuzzRealGame } from "../src/index.ts";
import type { ElectronFixture } from "./electron-fixture.ts";
import { launchFixture } from "./electron-fixture.ts";

// 用 stub __rmtestReal 伪造真实引擎表面（无需 RM_REAL_PROJECT 工程）
interface RealFuzzStubWindow {
  __rmtestReal?: {
    setPlayer: (x: number, y: number) => void;
    triggerAt: (x: number, y: number) => void;
    pressOk: () => void;
    snapshot: () => unknown;
  };
}

/** 重置页面到同一初始状态，使两次运行的起点一致 */
async function installRealStub(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as RealFuzzStubWindow;
    let px = 0;
    let py = 0;
    const switches = [false, false, false, false];
    w.__rmtestReal = {
      setPlayer(x, y) {
        px = x;
        py = y;
      },
      triggerAt(x, y) {
        // (2,2) 处的事件：玩家在其上触发即置开关 1（确定性）
        if (x === px && y === py && px === 2 && py === 2) switches[1] = true;
      },
      pressOk() {},
      snapshot() {
        return { mapId: 1, playerX: px, playerY: py, switches: [...switches], dataMapWidth: 8, dataMapHeight: 6 };
      },
    };
  });
}

describe("真实引擎 fuzz 的确定性", () => {
  let fx: ElectronFixture;

  beforeAll(async () => {
    fx = await launchFixture();
  }, 60_000);

  afterAll(async () => {
    await fx.close();
  });

  it("同 seed + 同步数预算 → 两次引擎侧运行结果完全一致", async () => {
    const opts = { maxSteps: 40, seed: 11 };
    await installRealStub(fx.page);
    const r1 = await fuzzRealGame(fx.page, opts);
    await installRealStub(fx.page); // 回到同一初始状态
    const r2 = await fuzzRealGame(fx.page, opts);

    expect(r1.truncated).toBe(false);
    expect(r1.steps).toBe(40); // 步数预算 = 唯一终止条件
    expect(r1.seed).toBe(11);
    expect(r2.steps).toBe(r1.steps);
    expect(r2.novelStates).toBe(r1.novelStates);
    expect(r2.crashes).toEqual(r1.crashes);
    expect(r2.finalSnapshot).toEqual(r1.finalSnapshot); // 终态一致 = 输入序列一致
  });

  it("墙钟安全上限触发 → 标记 truncated 且不改变步数预算语义", async () => {
    await installRealStub(fx.page);
    const r = await fuzzRealGame(fx.page, { maxSteps: 1_000_000, safetyBudgetMs: 40, seed: 5 });
    expect(r.truncated).toBe(true);
    expect(r.steps).toBeLessThan(1_000_000);
  });
});
