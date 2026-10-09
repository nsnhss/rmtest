/**
 * 场景覆盖（按地图）—— 语料场景在"地图"粒度上的覆盖统计。
 * 语义：场景 walk 到某地图或 assert 某地图 → 该地图被覆盖。
 * 分母 = 可达地图全集（覆盖义务）；不可达地图不计入。
 */
import type { IRDocument } from "../ir.ts";
import { reachableMapIds } from "./reachables.ts";

/** 结构类型：与 @rmtest/dsl 的 Scenario 兼容，避免 core → dsl 循环依赖 */
export interface ScenarioLike {
  id?: string;
  steps: Array<{ type: string; to?: { map: number; x?: number; y?: number }; map?: number }>;
}

export interface MapCoverage {
  mapId: number;
  name: string;
  covered: boolean;
}

export interface ScenarioCoverage {
  /** 可达地图总数（分母） */
  total: number;
  covered: number;
  maps: MapCoverage[];
}

export function scenarioMapCoverage(ir: IRDocument, scenarios: ScenarioLike[]): ScenarioCoverage {
  // 可达地图全集（地图级传送 BFS，不依赖事件页）
  const reachable = reachableMapIds(ir);

  const coveredBy = new Set<number>();
  for (const scenario of scenarios) {
    for (const step of scenario.steps) {
      if (step.type === "walk" && step.to) coveredBy.add(step.to.map);
      else if (step.type === "assert_map" && step.map !== undefined) coveredBy.add(step.map);
    }
  }

  const maps: MapCoverage[] = ir.maps
    .filter((m) => reachable.has(m.id))
    .map((m) => ({ mapId: m.id, name: m.name, covered: coveredBy.has(m.id) }));
  maps.sort((a, b) => a.mapId - b.mapId);

  return {
    total: maps.length,
    covered: maps.filter((m) => m.covered).length,
    maps,
  };
}
