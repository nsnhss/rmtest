/**
 * 真实引擎 fuzz —— 随机定位 + 事件触发 + 偶发按键，新颖度驱动。
 * 崩溃 = 单步 evaluate 异常（真实引擎的 JS 错误）。
 */
import type { Page } from "puppeteer-core";
import { mulberry32 } from "./fuzz.ts";
import { pageAsHandle, pressOk, snapshotReal, triggerAt, type RealSnapshot } from "./realengine.ts";

export interface RealFuzzOptions {
  maxSteps: number;
  timeBudgetMs: number;
  seed?: number;
}

export interface RealFuzzResult {
  steps: number;
  novelStates: number;
  crashes: string[];
  finalSnapshot: RealSnapshot;
}

interface RealWindow {
  __rmtestReal: { setPlayer: (x: number, y: number) => void };
}

const DEFAULT_W = 8;
const DEFAULT_H = 6;

export async function fuzzRealGame(page: Page, opts: RealFuzzOptions): Promise<RealFuzzResult> {
  const rand = mulberry32(opts.seed ?? (Date.now() >>> 0));
  const seen = new Set<string>();
  const crashes: string[] = [];
  let steps = 0;
  let novel = 0;
  let dims = { w: DEFAULT_W, h: DEFAULT_H };
  const start = Date.now();

  const stateKey = (s: RealSnapshot): string => {
    const bits = s.switches
      .map((v, i) => (v ? i : 0))
      .filter((i) => i > 0)
      .join(",");
    return `${s.mapId}:${s.playerX}:${s.playerY}:${bits}`;
  };

  while (steps < opts.maxSteps && Date.now() - start < opts.timeBudgetMs) {
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

  return { steps, novelStates: novel, crashes, finalSnapshot: await snapshotReal(pageAsHandle(page)) };
}

// 供 CLI 复用的随机源
export { mulberry32 };
