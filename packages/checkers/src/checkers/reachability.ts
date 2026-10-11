/**
 * 可达性检查 —— 传送图 BFS，报告从开局不可达的地图。
 * 注意：车辆与脚本传送不在图中，故低置信提示。
 */
import { Cmd, type CheckerPlugin, type IRCommand, type IRDocument, type ReportSection } from "@rmtest/core";
import { walkCommands } from "@rmtest/core";
import { core } from "../i18n/core.ts";

export const unreachableMapChecker: CheckerPlugin = {
  manifest: { name: "unreachable-map", version: "0.1.0", irVersion: 1, facts: [] },
  check(_facts, ir: IRDocument) {
    const edges = new Map<number, number[]>();
    for (const map of ir.maps) edges.set(map.id, []);
    /** 公共事件内的传送目标：调用点静态不可知，按任意地图都可能触发，直接计入可达 */
    const commonTargets = new Set<number>();

    const scan = (commands: IRCommand[], sourceMapId: number | null) => {
      walkCommands(commands, {}, (cmd) => {
        if (cmd.code !== Cmd.TransferPlayer) return;
        // 真实格式 mode 0 = 直接指定地图；变量指定静态不可判定
        if (Number(cmd.parameters[0]) !== 0) return;
        const target = Number(cmd.parameters[1]);
        if (!Number.isFinite(target) || !edges.has(target)) return;
        if (sourceMapId === null) commonTargets.add(target);
        else edges.get(sourceMapId)!.push(target);
      });
    };

    for (const map of ir.maps) {
      for (const ev of map.events) {
        for (const page of ev.pages) scan(page.commands, map.id);
      }
    }
    for (const ce of ir.commonEvents) scan(ce.commands, null);

    const visited = new Set<number>();
    const queue = [ir.system.startMapId, ...commonTargets];
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
          ...core("checker.core.unreachableMap", { id: map.id, name: map.name }),
          evidence: { mapId: map.id },
        });
      }
    }
    return sections;
  },
};
