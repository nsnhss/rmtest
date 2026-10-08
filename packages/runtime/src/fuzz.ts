/**
 * Fuzz 探索器 —— 随机输入序列 + 状态新颖度驱动的灰色盒探索。
 * 目标：以时间盒内最大化"新状态"覆盖，同时捕获崩溃。
 * 确定性：同 seed 同结果（可复现）。
 */
import type { Page } from "puppeteer-core";
import { readCoverage, type CoverageCounters } from "./coverage.ts";

export interface FuzzOptions {
  timeBudgetMs: number;
  maxSteps: number;
  seed?: number;
}

export interface FuzzResult {
  steps: number;
  novelStates: number;
  crashes: string[];
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
  const rand = mulberry32(opts.seed ?? Date.now() >>> 0);
  const start = Date.now();
  const crashes: string[] = [];
  const seen = new Set<string>();
  let steps = 0;
  let novelStates = 0;

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

  while (steps < opts.maxSteps && Date.now() - start < opts.timeBudgetMs) {
    try {
      await step();
    } catch (err) {
      crashes.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { steps, novelStates, crashes, coverage: await readCoverage(page) };
}
