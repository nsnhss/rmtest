/**
 * 悬空引用检查 —— 检查器 v1 的第一主力。
 * 资产缺失 / 数据 ID 越界或不存在；大小写不一致单独降级为警告。
 */
import { type CheckerPlugin, type GameUniverse, type RefCategory, type RefGraph, type ReportSection } from "@rmtest/core";
import { formatLocation } from "../format.ts";

const CATEGORY_LABEL: Record<string, string> = {
  map: "地图",
  switch: "开关",
  variable: "变量",
  commonEvent: "公共事件",
  item: "道具",
  weapon: "武器",
  armor: "防具",
  skill: "技能",
  actor: "角色",
  troop: "战斗队伍",
  enemy: "敌人",
  class: "职业",
  tileset: "图块集",
};

function idExists(universe: GameUniverse, category: RefCategory, id: number): boolean {
  if (id <= 0) return false;
  switch (category) {
    case "switch":
      return id < universe.switchCount;
    case "variable":
      return id < universe.variableCount;
    case "map":
      return universe.maps.has(id);
    case "commonEvent":
      return universe.commonEventIds.has(id);
    case "item":
      return universe.itemIds.has(id);
    case "weapon":
      return universe.weaponIds.has(id);
    case "armor":
      return universe.armorIds.has(id);
    case "skill":
      return universe.skillIds.has(id);
    case "actor":
      return universe.actorIds.has(id);
    case "troop":
      return universe.troopIds.has(id);
    case "enemy":
      return universe.enemyIds.has(id);
    case "class":
      return universe.classIds.has(id);
    case "tileset":
      return universe.tilesetIds.has(id);
    default:
      return true;
  }
}

function findActualCase(universe: GameUniverse, target: string): string | null {
  const lower = target.toLowerCase();
  for (const f of universe.assetFiles) {
    if (f.toLowerCase() === lower) return f;
  }
  return null;
}

export const danglingRefChecker: CheckerPlugin = {
  manifest: { name: "dangling-ref", version: "0.1.0", irVersion: 1, facts: ["refgraph", "universe"] },
  check(facts) {
    const graph = facts["refgraph"] as RefGraph;
    const universe = facts["universe"] as GameUniverse;
    const sections: ReportSection[] = [];

    for (const ref of graph.refs) {
      if (ref.category === "asset") {
        if (universe.assetFiles.has(ref.target)) continue;
        const actual = findActualCase(universe, ref.target);
        if (actual) {
          sections.push({
            type: "dangling-ref",
            severity: "warning",
            confidence: "low",
            location: ref.location,
            message: `资源 ${ref.target} 大小写不一致：磁盘上是 ${actual}。Windows 下正常，部署到 Linux/移动端会缺失`,
            evidence: { ref: ref.target, actual },
          });
          continue;
        }
        sections.push({
          type: "dangling-ref",
          severity: "error",
          confidence: "high",
          location: ref.location,
          message: `缺失资源: ${ref.target}`,
          evidence: { ref: ref.target },
        });
        continue;
      }

      const id = Number(ref.target);
      if (!idExists(universe, ref.category, id)) {
        sections.push({
          type: "dangling-ref",
          severity: "error",
          confidence: "high",
          location: ref.location,
          message: `悬空引用: ${CATEGORY_LABEL[ref.category] ?? ref.category} ${ref.target} 不存在（${formatLocation(ref.location)}）`,
          evidence: { category: ref.category, target: ref.target },
        });
      }
    }
    return sections;
  },
};
