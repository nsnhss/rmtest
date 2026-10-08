/**
 * 图标索引越界 —— 数据库条目 iconIndex 超出 IconSet 实际图标数。
 * IconSet 缺失时（iconCount=0）跳过，不产生噪音。
 */
import { type CheckerPlugin, type GameUniverse, type IRDocument, type ReportSection } from "@rmtest/core";

export const iconIndexChecker: CheckerPlugin = {
  manifest: { name: "icon-index", version: "0.1.0", irVersion: 1, facts: ["universe"] },
  check(facts, ir: IRDocument) {
    const universe = facts["universe"] as GameUniverse;
    if (universe.iconCount === 0) return [];

    const sections: ReportSection[] = [];
    const check = (iconIndex: number, dataKey: string, dataId: number, name: string) => {
      if (iconIndex >= universe.iconCount) {
        sections.push({
          type: "icon-index",
          severity: "error",
          confidence: "high",
          location: { dataKey, dataId },
          message: `图标索引 ${iconIndex} 越界（IconSet 共 ${universe.iconCount} 个图标）: ${name}`,
          evidence: { iconIndex, iconCount: universe.iconCount },
        });
      }
    };

    for (const item of [...ir.items, ...ir.weapons, ...ir.armors]) {
      check(item.iconIndex, "item", item.id, item.name);
    }
    for (const skill of ir.skills) {
      check(skill.iconIndex, "skill", skill.id, skill.name);
    }
    return sections;
  },
};
