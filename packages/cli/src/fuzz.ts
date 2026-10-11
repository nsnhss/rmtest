/**
 * CLI fuzz —— 真实引擎随机探索。
 * 输出：步数、新颖状态数、崩溃清单。
 * 步数预算（maxSteps）是确定性终止条件；--time 只作为可选的墙钟安全上限。
 */
import path from "node:path";
import { detectEngine } from "./loader.ts";
import {
  closeRealGame,
  fuzzRealGame,
  gotoMap,
  launchRealGame,
  pageAsHandle,
  waitGameReady,
  type RealFuzzResult,
} from "@rmtest/runtime";

export interface FuzzCliOptions {
  /** 确定性步数上限；省略时由 seed 派生，保证可复现 */
  maxSteps?: number;
  seed?: number;
  /** 可选墙钟安全上限（毫秒）：触发时 truncated=true，不参与复现 */
  safetyBudgetMs?: number;
}

export async function fuzzCli(projectDir: string, opts: FuzzCliOptions = {}): Promise<RealFuzzResult> {
  if (detectEngine(projectDir) === "rgss") throw new Error("RGSS 动态执行未支持");
  const electronExe = path.resolve(import.meta.dirname, "../../../node_modules/electron/dist/electron.exe");
  const session = await launchRealGame(projectDir, { electronPath: electronExe });
  try {
    await waitGameReady(session.page);
    const entered = await gotoMap(pageAsHandle(session.page));
    if (!entered) throw new Error("进入地图场景失败");
    const cap = opts.safetyBudgetMs;
    return await fuzzRealGame(session.page, {
      maxSteps: opts.maxSteps,
      seed: opts.seed,
      safetyBudgetMs: cap !== undefined && cap > 0 ? cap : undefined,
    });
  } finally {
    await closeRealGame(session);
  }
}
