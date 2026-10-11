import path from "node:path";
import type { Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeRealGame,
  launchRealGame,
  MOVE_DIRS,
  pageAsHandle,
  REAL_BRIDGE,
  runRealEvent,
  waitGameReady,
  walkPathTo,
  type RealGameSession,
} from "../src/index.ts";
import type { ElectronFixture } from "./electron-fixture.ts";
import { launchFixture } from "./electron-fixture.ts";

// 真实引擎文件（rpg_*.js）是 KADOKAWA 版权物，不进仓库。
// 本测试需要 RM_REAL_PROJECT 指向本机 MV/MZ 工程；未设置时整组跳过。
const PROJECT = process.env["RM_REAL_PROJECT"];

describe.skipIf(!PROJECT)("真实 MV 引擎验证", () => {
  let session: RealGameSession;
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");

  beforeAll(async () => {
    session = await launchRealGame(PROJECT!, { electronPath: electronExe });
    await waitGameReady(session.page);
    await session.page.evaluate(() => {
      (window as never as { __rmtestReal?: { setupNewGame: () => void } }).__rmtestReal!.setupNewGame();
    });
  }, 240_000);

  afterAll(async () => {
    await closeRealGame(session);
  });

  it("真实引擎：Control Switches + Control Variables 命令语义", async () => {
    const result = await runRealEvent(session.page, [
      { code: 121, indent: 0, parameters: [5, 5, 0] }, // 开关 5 ON
      { code: 122, indent: 0, parameters: [1, 1, 0, 0, 5] }, // 变量 1 = 常量 5（常量在 params[4]）
      { code: 0, indent: 0, parameters: [] },
    ]);
    expect(result.status).toBe("finished");
    expect(result.snapshot.switches[5]).toBe(true); // 开关 5
    expect(result.snapshot.variables[1]).toBe(5); // 变量 1
  });

  it("真实引擎：Transfer Player 写入传送目标并进入等待", async () => {
    const result = await runRealEvent(session.page, [
      { code: 201, indent: 0, parameters: [0, 1, 2, 2, 0, 0] }, // mode 0: 地图 1, (2,2)
      { code: 0, indent: 0, parameters: [] },
    ]);
    expect(result.status).toBe("waiting"); // 真实引擎中传送是等待语义
    expect(result.snapshot.transferring).toBe(true);
    expect(result.snapshot.transferTarget).toEqual({ mapId: 1, x: 2, y: 2 });
  });

  it("真实引擎：数据加载完成且开局状态干净", async () => {
    const snapshot = (await session.page.evaluate(() => {
      const b = (window as never as { __rmtestReal?: { snapshot: () => unknown } }).__rmtestReal!;
      return b.snapshot();
    })) as { ready: boolean; switches: number[] };
    expect(snapshot.ready).toBe(true);
    expect(snapshot.switches[1]).toBe(false); // 开关 1 初始 OFF
  });
});

// —— 瓦片通行方向语义（无需真实游戏，用 stub $gameMap/$gamePlayer 直接驱动桥） ——

interface WalkStubWindow {
  $gameMap: {
    width: () => number;
    height: () => number;
    checkPassage: (x: number, y: number, bit: number) => boolean;
  };
  $gamePlayer: { _x: number; _y: number; locate: (x: number, y: number) => void };
  __walkCalls?: Array<[number, number, number]>;
}

/** 1×2 地图：起点 (0,1)、目标 (0,0)；可选地把某格的某一位设为阻断 */
async function installWalkStub(page: Page, block: { x: number; y: number; bit: number } | null): Promise<void> {
  await page.evaluate((b) => {
    const w = window as unknown as WalkStubWindow;
    const calls: Array<[number, number, number]> = [];
    w.__walkCalls = calls;
    w.$gameMap = {
      width: () => 1,
      height: () => 2,
      checkPassage: (x, y, bit) => {
        calls.push([x, y, bit]);
        return !(b !== null && x === b.x && y === b.y && bit === b.bit);
      },
    };
    w.$gamePlayer = {
      _x: 0,
      _y: 1,
      locate(x, y) {
        this._x = x;
        this._y = y;
      },
    };
  }, block);
}

describe("walkPathTo 瓦片通行方向语义（stub 引擎）", () => {
  let fx: ElectronFixture;

  beforeAll(async () => {
    fx = await launchFixture();
    await fx.page.evaluate(REAL_BRIDGE);
  }, 240_000);

  afterAll(async () => {
    await fx.close();
  });

  it("方向位表与引擎一致：上=1/下=8/左=4/右=2（目标格的反向位）", () => {
    const dir = (dx: number, dy: number) => MOVE_DIRS.find((d) => d.dx === dx && d.dy === dy);
    expect(dir(0, -1)).toMatchObject({ moveBit: 8, enterBit: 1 }); // 上：目标格按"下"位 1
    expect(dir(0, 1)).toMatchObject({ moveBit: 1, enterBit: 8 }); // 下：目标格按"上"位 8
    expect(dir(-1, 0)).toMatchObject({ moveBit: 2, enterBit: 4 }); // 左：目标格按"右"位 4
    expect(dir(1, 0)).toMatchObject({ moveBit: 4, enterBit: 2 }); // 右：目标格按"左"位 2
  });

  it("源格按移动方向检查、目标格按反向检查；单向瓦片被拒", async () => {
    await installWalkStub(fx.page, { x: 0, y: 0, bit: 1 });
    const reached = await walkPathTo(pageAsHandle(fx.page), 0, 0);
    expect(reached).toBe(false); // (0,0) 的下向位被阻断 → 自下而上无法进入

    const w = await fx.page.evaluate(() => (window as unknown as WalkStubWindow).__walkCalls);
    // 源格 (0,1) 按移动方向（上=8）检查，目标格 (0,0) 按反向（下=1）检查
    expect(w).toContainEqual([0, 1, 8]);
    expect(w).toContainEqual([0, 0, 1]);
  });

  it("全通行地面 → 目标可达且玩家落到目标格", async () => {
    await installWalkStub(fx.page, null);
    const reached = await walkPathTo(pageAsHandle(fx.page), 0, 0);
    expect(reached).toBe(true);

    const pos = (await fx.page.evaluate(() => {
      const w = window as unknown as WalkStubWindow;
      return { x: w.$gamePlayer._x, y: w.$gamePlayer._y };
    })) as { x: number; y: number };
    expect(pos).toEqual({ x: 0, y: 0 });
  });
});
