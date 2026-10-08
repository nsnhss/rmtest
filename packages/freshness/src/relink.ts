/**
 * 机械重链 —— broken 引用的自动迁移。
 *
 * 机制：场景绑定记录了实体的内容哈希；当引用失效（如地图被删除/重排）时，
 * 在现网数据中搜索内容哈希完全一致的实体，唯一命中即自动迁移绑定。
 *
 * v1 范围：仅地图（数据文件 = 天然的哈希粒度）。开关/变量的哈希粒度
 * 是 System.json 整文件，无法定位个体，留待后续。
 */
import type { IRDocument } from "@rmtest/core";
import type { Scenario } from "@rmtest/dsl";

export interface RelinkRecord {
  kind: "map";
  fromId: number;
  toId: number;
}

export interface RelinkOutcome {
  /** 重链后的场景副本 */
  scenario: Scenario;
  relinked: RelinkRecord[];
  /** 无法重链的引用说明 */
  unresolved: string[];
}

const MAP_FILE = /^data\/Map(\d+)\.json$/;

export function relinkScenario(
  scenario: Scenario,
  ir: IRDocument,
  fileHashes: ReadonlyMap<string, string>,
): RelinkOutcome {
  const next = JSON.parse(JSON.stringify(scenario)) as Scenario;
  const relinked: RelinkRecord[] = [];
  const unresolved: string[] = [];
  const validMapIds = new Set(ir.maps.map((m) => m.id));

  // 按 mapId 索引现网地图数据文件的哈希
  const hashById = new Map<number, string>();
  for (const [path, hash] of fileHashes) {
    const m = MAP_FILE.exec(path);
    if (m) hashById.set(Number(m[1]), hash);
  }

  next.steps.forEach((step, i) => {
    if (step.type !== "walk") return;
    if (validMapIds.has(step.to.map)) return;

    const binding = (next.bindings ?? []).find((b) => b.kind === "map" && b.id === step.to.map);
    if (!binding) {
      unresolved.push(`第 ${i + 1} 步引用地图 ${step.to.map} 已不存在，且场景无绑定哈希可重链`);
      return;
    }

    const candidates = [...hashById.entries()].filter(([id, hash]) => id !== step.to.map && validMapIds.has(id) && hash === binding.hash);
    if (candidates.length !== 1) {
      unresolved.push(
        `第 ${i + 1} 步引用地图 ${step.to.map} 已不存在；内容哈希匹配到 ${candidates.length} 个候选，无法唯一重链`,
      );
      return;
    }

    const [toId] = candidates[0]!;
    const fromId = step.to.map;
    step.to.map = toId;
    binding.id = toId;
    relinked.push({ kind: "map", fromId, toId });
  });

  return { scenario: next, relinked, unresolved };
}
