/**
 * 悬空引用检查 —— 检查器 v1 的第一主力。
 * 资产缺失 / 数据 ID 越界或不存在；大小写不一致单独降级为警告。
 */
import {
  type CheckerPlugin,
  type GameUniverse,
  type RefCategory,
  type RefGraph,
  type ReportSection,
} from "@rmtest/core";
import type { LocalizableMessage } from "@rmtest/i18n";
import { core, locationMsg } from "../i18n/core.ts";

const CATEGORY_LABEL: Record<string, LocalizableMessage> = {
  map: core("checker.core.category.map"),
  switch: core("checker.core.category.switch"),
  variable: core("checker.core.category.variable"),
  commonEvent: core("checker.core.category.commonEvent"),
  item: core("checker.core.category.item"),
  weapon: core("checker.core.category.weapon"),
  armor: core("checker.core.category.armor"),
  skill: core("checker.core.category.skill"),
  actor: core("checker.core.category.actor"),
  troop: core("checker.core.category.troop"),
  enemy: core("checker.core.category.enemy"),
  class: core("checker.core.category.class"),
  tileset: core("checker.core.category.tileset"),
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
            ...core("checker.core.danglingCaseMismatch", { target: ref.target, actual }),
            evidence: { ref: ref.target, actual },
          });
          continue;
        }
        sections.push({
          type: "dangling-ref",
          severity: "error",
          confidence: "high",
          location: ref.location,
          ...core("checker.core.danglingAsset", { target: ref.target }),
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
          ...core("checker.core.danglingReference", {
            category: CATEGORY_LABEL[ref.category] ?? ref.category,
            target: ref.target,
            location: locationMsg(ref.location),
          }),
          evidence: { category: ref.category, target: ref.target },
        });
      }
    }
    return sections;
  },
};
