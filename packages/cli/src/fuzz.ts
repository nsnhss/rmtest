/**
 * CLI fuzz —— 真实引擎随机探索。
 * 输出：步数、新颖状态数、崩溃清单。
 */
import path from "node:path";
import {
  closeRealGame,
  fuzzRealGame,
  gotoMap,
  launchRealGame,
  waitGameReady,
  type RealFuzzResult,
} from "@rmtest/runtime";

export interface FuzzCliOptions {
  maxSteps?: number;
  timeBudgetMs?: number;
  seed?: number;
}

export async function fuzzCli(projectDir: string, opts: FuzzCliOptions = {}): Promise<RealFuzzResult> {
  const electronExe = path.resolve(import.meta.dirname, "../../../node_modules/electron/dist/electron.exe");
  const session = await launchRealGame(projectDir, { electronPath: electronExe });
  try {
    await waitGameReady(session.page);
    const entered = await gotoMap(session.page);
    if (!entered) throw new Error("进入地图场景失败");
    return await fuzzRealGame(session.page, {
      maxSteps: opts.maxSteps ?? 500,
      timeBudgetMs: opts.timeBudgetMs ?? 30_000,
      seed: opts.seed,
    });
  } finally {
    await closeRealGame(session);
  }
}
