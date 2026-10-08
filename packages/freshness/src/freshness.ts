/**
 * 时效性引擎 —— 测试实例 vs 当前游戏的三分类。
 *
 * broken：硬引用失效（引用的地图/开关/变量已不存在）—— 测试不能跑
 * stale ：引用都能解析，但游戏内容指纹变了 —— 能跑但断言意图可能已漂移
 * fresh ：指纹一致 —— 直接跑
 *
 * 判定优先级：broken 先于 stale 先于 fresh。
 */
import type { GameUniverse, IRDocument } from "@rmtest/core";
import { validateScenario, type Scenario } from "@rmtest/dsl";

export type FreshnessStatus = "fresh" | "broken" | "stale";

export interface FreshnessResult {
  scenarioId: string;
  status: FreshnessStatus;
  /** broken 时的校验问题 */
  issues: string[];
}

export function classifyScenario(
  scenario: Scenario,
  ir: IRDocument,
  universe: GameUniverse,
  currentFingerprint: string,
): FreshnessResult {
  const validation = validateScenario(scenario, ir, universe);
  if (!validation.ok) {
    return { scenarioId: scenario.id, status: "broken", issues: validation.issues.map((i) => i.message) };
  }
  if (scenario.game_fingerprint && scenario.game_fingerprint !== currentFingerprint) {
    return { scenarioId: scenario.id, status: "stale", issues: [] };
  }
  return { scenarioId: scenario.id, status: "fresh", issues: [] };
}

export interface MaintenanceReport {
  fresh: number;
  broken: number;
  stale: number;
  items: FreshnessResult[];
}

export function maintenanceReport(
  corpus: Scenario[],
  ir: IRDocument,
  universe: GameUniverse,
  currentFingerprint: string,
): MaintenanceReport {
  const items = corpus.map((s) => classifyScenario(s, ir, universe, currentFingerprint));
  return {
    fresh: items.filter((i) => i.status === "fresh").length,
    broken: items.filter((i) => i.status === "broken").length,
    stale: items.filter((i) => i.status === "stale").length,
    items,
  };
}
