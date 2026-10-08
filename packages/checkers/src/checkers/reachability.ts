/**
 * 可达性检查 —— 传送图 BFS，报告从开局不可达的地图。
 * 注意：车辆与脚本传送不在图中，故低置信提示。
 */
import { Cmd, type CheckerPlugin, type IRDocument, type ReportSection } from "@rmtest/core";
import { walkCommands } from "@rmtest/core";

export const unreachableMapChecker: CheckerPlugin = {
  manifest: { name: "unreachable-map", version: "0.1.0", irVersion: 1, facts: [] },
  check(_facts, ir: IRDocument) {
    const edges = new Map<number, number[]>();
    for (const map of ir.maps) edges.set(map.id, []);
    for (const map of ir.maps) {
      for (const ev of map.events) {
        for (const page of ev.pages) {
          walkCommands(page.commands, {}, (cmd) => {
            if (cmd.code !== Cmd.TransferPlayer) return;
            const target = Number(cmd.parameters[0]);
            if (Number.isFinite(target) && edges.has(target)) edges.get(map.id)!.push(target);
          });
        }
      }
    }

    const visited = new Set<number>();
    const queue = [ir.system.startMapId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(...edges.get(id) ?? []);
    }

    const sections: ReportSection[] = [];
    for (const map of ir.maps) {
      if (!visited.has(map.id)) {
        sections.push({
          type: "unreachable-map",
          severity: "info",
          confidence: "low",
          location: { mapId: map.id },
          message: `地图 ${map.id} (${map.name}) 从开局不可达（仅传送图，不含车辆/脚本传送）`,
          evidence: { mapId: map.id },
        });
      }
    }
    return sections;
  },
};
