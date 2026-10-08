/**
 * 覆盖计数 —— 动态执行的"跑过什么"。
 * 计数器来自运行时插桩（页面侧）；本模块负责读取、合并、对比。
 */
import type { Page } from "puppeteer-core";

export interface BranchCount {
  taken: number;
  total: number;
}

export interface CoverageCounters {
  /** key = "mapId:x:y:pageIndex" → 激活次数 */
  pages: Record<string, number>;
  /** key = 事件位置 → 分支评估统计 */
  branches: Record<string, BranchCount>;
}

export interface GamePageWithCoverage {
  counters: () => CoverageCounters;
}

export async function readCoverage(page: Page): Promise<CoverageCounters> {
  return (await page.evaluate(() => {
    const pageWindow = window as unknown as { __game: GamePageWithCoverage };
    return pageWindow.__game.counters();
  })) as CoverageCounters;
}

export function emptyCoverage(): CoverageCounters {
  return { pages: {}, branches: {} };
}

/** 合并多次运行计数（语料库聚合） */
export function mergeCoverage(...runs: CoverageCounters[]): CoverageCounters {
  const out = emptyCoverage();
  for (const run of runs) {
    for (const [key, n] of Object.entries(run.pages)) out.pages[key] = (out.pages[key] ?? 0) + n;
    for (const [key, b] of Object.entries(run.branches)) {
      const cur = out.branches[key] ?? { taken: 0, total: 0 };
      cur.taken += b.taken;
      cur.total += b.total;
      out.branches[key] = cur;
    }
  }
  return out;
}

export interface CoverageGap {
  /** 覆盖的目标事件页数 */
  covered: number;
  /** 可达目标事件页总数 */
  total: number;
  /** 未覆盖的事件页 key */
  uncovered: string[];
  /** 分支只走过一边的 key（taken==0 或 taken==total） */
  oneSidedBranches: string[];
}

/** 对比覆盖率：需要"可达事件页全集"作分母 */
export function coverageGap(counters: CoverageCounters, reachablePages: string[]): CoverageGap {
  const uncovered = reachablePages.filter((p) => !(p in counters.pages));
  const oneSidedBranches = Object.entries(counters.branches)
    .filter(([, b]) => b.taken === 0 || b.taken === b.total)
    .map(([k]) => k);
  return {
    covered: reachablePages.length - uncovered.length,
    total: reachablePages.length,
    uncovered,
    oneSidedBranches,
  };
}
