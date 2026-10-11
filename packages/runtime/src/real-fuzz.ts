/**
 * 真实引擎 fuzz —— 随机定位 + 事件触发 + 偶发按键，新颖度驱动。
 * 崩溃 = 单步 evaluate 异常（真实引擎的 JS 错误）。
 * 确定性：同 seed + 同步数预算 → 同输入序列、同步数与同新颖状态数（可复现）。
 * 可选的墙钟安全上限（safetyBudgetMs）仅兜底防长跑，触发时 truncated=true，不参与复现结论。
 */
import type { Page } from "puppeteer-core";
import { deriveStepBudget, mulberry32 } from "./fuzz.ts";
import { pageAsHandle, pressOk, snapshotReal, triggerAt, type RealSnapshot } from "./realengine.ts";

export interface RealFuzzOptions {
  /** 确定性步数上限；省略时由 seed 派生（deriveStepBudget），保证可复现 */
  maxSteps?: number;
  seed?: number;
  /** 可选墙钟安全上限（毫秒）：非确定性，触发时 truncated=true，不属于可复现结果 */
  safetyBudgetMs?: number;
}

export interface RealFuzzResult {
  steps: number;
  novelStates: number;
  crashes: string[];
  /** 本次运行实际使用的种子（调用未提供时取当前时间） */
  seed: number;
  /** 是否被墙钟安全上限截断：true 时该次运行不可作为可复现结论 */
  truncated: boolean;
  finalSnapshot: RealSnapshot;
}

interface RealWindow {
  __rmtestReal: { setPlayer: (x: number, y: number) => void };
}

const DEFAULT_W = 8;
const DEFAULT_H = 6;

export async function fuzzRealGame(page: Page, opts: RealFuzzOptions): Promise<RealFuzzResult> {
  const seed = opts.seed ?? (Date.now() >>> 0);
  const rand = mulberry32(seed);
  const stepBudget = opts.maxSteps ?? deriveStepBudget(seed);
  const seen = new Set<string>();
  const crashes: string[] = [];
  let steps = 0;
  let novel = 0;
  let truncated = false;
  let dims = { w: DEFAULT_W, h: DEFAULT_H };
  const start = Date.now();

  const stateKey = (s: RealSnapshot): string => {
    const bits = s.switches
      .map((v, i) => (v ? i : 0))
      .filter((i) => i > 0)
      .join(",");
    return `${s.mapId}:${s.playerX}:${s.playerY}:${bits}`;
  };

  while (steps < stepBudget) {
    // 墙钟安全上限：非确定性，仅兜底防长跑；触发时标记 truncated，不参与可复现结论
    if (opts.safetyBudgetMs !== undefined && Date.now() - start >= opts.safetyBudgetMs) {
      truncated = true;
      break;
    }
    const roll = rand();
    const x = Math.floor(rand() * dims.w);
    const y = Math.floor(rand() * dims.h);
    const press = rand() < 0.3;
    try {
      await page.evaluate(
        (a: { x: number; y: number }) => {
          const bridge = (window as unknown as RealWindow).__rmtestReal;
          bridge.setPlayer(a.x, a.y);
        },
        { x, y },
      );
      await triggerAt(pageAsHandle(page), x, y);
      if (press) await pressOk(pageAsHandle(page));
      const s = await snapshotReal(pageAsHandle(page));
      dims = { w: s.dataMapWidth || DEFAULT_W, h: s.dataMapHeight || DEFAULT_H };
      const key = stateKey(s);
      steps++;
      if (!seen.has(key)) {
        seen.add(key);
        novel++;
      }
    } catch (err) {
      crashes.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { steps, novelStates: novel, crashes, seed, truncated, finalSnapshot: await snapshotReal(pageAsHandle(page)) };
}

// 供 CLI 复用的随机源
export { mulberry32 };
