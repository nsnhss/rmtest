import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRealGame, launchRealGame, runRealEvent, waitGameReady, type RealGameSession } from "../src/index.ts";

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
  }, 120_000);

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
