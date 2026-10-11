/**
 * Fuzz 探索器 —— 随机输入序列 + 状态新颖度驱动的灰色盒探索。
 * 目标：在确定的步数预算内最大化"新状态"覆盖，同时捕获崩溃。
 * 确定性：同 seed + 同步数预算 → 同输入序列、同步数与同新颖状态数（可复现）。
 * 可选的墙钟安全上限（safetyBudgetMs）仅用于兜底防长跑，触发时结果标记 truncated，
 * 不计入"可复现"结论。
 */
import type { Page } from "puppeteer-core";
import { readCoverage, type CoverageCounters } from "./coverage.ts";

export interface FuzzOptions {
  /** 确定性步数上限；省略时由 seed 派生（deriveStepBudget），保证可复现 */
  maxSteps?: number;
  seed?: number;
  /** 可选墙钟安全上限（毫秒）：非确定性，触发时 truncated=true，不属于可复现结果 */
  safetyBudgetMs?: number;
}

export interface FuzzResult {
  steps: number;
  novelStates: number;
  crashes: string[];
  /** 本次运行实际使用的种子（调用未提供时取当前时间） */
  seed: number;
  /** 是否被墙钟安全上限截断：true 时该次运行不可作为可复现结论 */
  truncated: boolean;
  coverage: CoverageCounters;
}

/** mulberry32 —— 确定性 PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由种子派生确定性步数预算（1..600），供省略 maxSteps 时使用，保证运行可复现 */
export function deriveStepBudget(seed: number): number {
  return 1 + Math.floor(mulberry32(seed >>> 0)() * 600);
}

// 页面契约：stub 世界表面（与 scenario.ts 一致）
interface GamePage {
  startNewGame: () => void;
  walk: (x: number, y: number) => void;
  interact: () => void;
  snapshot: () => {
    mapId: number;
    x: number;
    y: number;
    switches: Record<string, boolean>;
    transfer: { mapId: number; x: number; y: number } | null;
  };
}
interface GameWindow {
  __game: GamePage;
}

export async function fuzzGame(page: Page, opts: FuzzOptions): Promise<FuzzResult> {
  const seed = opts.seed ?? (Date.now() >>> 0);
  const rand = mulberry32(seed);
  const stepBudget = opts.maxSteps ?? deriveStepBudget(seed);
  const start = Date.now();
  const crashes: string[] = [];
  const seen = new Set<string>();
  let steps = 0;
  let novelStates = 0;
  let truncated = false;

  const step = async (): Promise<{ stateKey: string; novel: boolean }> => {
    // PRNG 在 Node 侧推进（闭包无法序列化进页面），每步传纯数字
    const roll = rand();
    const x = Math.floor(rand() * 5);
    const y = Math.floor(rand() * 4);
    const stateKey = (await page.evaluate((action: { roll: number; x: number; y: number }) => {
      const game = (window as unknown as GameWindow).__game;
      if (action.roll < 0.1) {
        game.startNewGame();
      } else if (action.roll < 0.5) {
        game.walk(action.x, action.y);
      } else {
        game.walk(2, 2); // 事件格
        game.interact();
      }
      const s = game.snapshot();
      const switchBits = Object.entries(s.switches)
        .filter(([, v]) => v)
        .map(([id]) => id)
        .sort()
        .join(",");
      return `${s.mapId}:${s.x}:${s.y}:${switchBits}`;
    }, { roll, x, y })) as string;

    steps++;
    if (seen.has(stateKey)) return { stateKey, novel: false };
    seen.add(stateKey);
    novelStates++;
    return { stateKey, novel: true };
  };

  while (steps < stepBudget) {
    // 墙钟安全上限：非确定性，仅兜底防长跑；触发时标记 truncated，不参与可复现结论
    if (opts.safetyBudgetMs !== undefined && Date.now() - start >= opts.safetyBudgetMs) {
      truncated = true;
      break;
    }
    try {
      await step();
    } catch (err) {
      crashes.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { steps, novelStates, crashes, seed, truncated, coverage: await readCoverage(page) };
}
