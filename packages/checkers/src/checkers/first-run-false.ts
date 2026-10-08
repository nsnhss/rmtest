/**
 * 首触发恒假检查 —— "写入点在判断之后"的经典事件逻辑 bug。
 *
 * 健全性规则（可证明）：
 * 条件判断（111）读开关/变量 S；若 S 在本事件页内的全部写入点都位于
 * 该判断之后、且事件页外没有任何写入（生命周期确认），则首次触发时
 * S 必为初始值 → 条件恒假；事件需要二次触发才可能生效。
 * 有外部写入（其他事件/公共事件写 S）时无法证明，跳过。
 */
import { Cmd, type CheckerPlugin, type IRDocument, type Lifecycle, type RefLocation, type ReportSection } from "@rmtest/core";
import { walkCommands } from "@rmtest/core";

interface PageWrites {
  /** 页内写入点（commandIndex 升序） */
  indexes: number[];
  /** 页外写入点 */
  external: RefLocation[];
}

function collectPageWrites(life: Lifecycle, mapId: number, eventId: number, pageIndex: number, kind: "switch" | "variable", id: number): PageWrites {
  const map = kind === "switch" ? life.switches : life.variables;
  const use = map.get(id);
  const out: PageWrites = { indexes: [], external: [] };
  if (!use) return out;
  for (const w of use.writes) {
    if (w.mapId === mapId && w.eventId === eventId && w.pageIndex === pageIndex && w.commandIndex !== undefined) {
      out.indexes.push(w.commandIndex);
    } else {
      out.external.push(w);
    }
  }
  out.indexes.sort((a, b) => a - b);
  return out;
}

export const firstRunFalseChecker: CheckerPlugin = {
  manifest: { name: "first-run-false", version: "0.1.0", irVersion: 1, facts: ["lifecycle"] },
  check(facts, ir: IRDocument) {
    const life = facts["lifecycle"] as Lifecycle;
    const sections: ReportSection[] = [];

    for (const map of ir.maps) {
      for (const ev of map.events) {
        for (const page of ev.pages) {
          walkCommands(page.commands, { mapId: map.id, eventId: ev.id, pageIndex: page.index }, (cmd, loc) => {
            if (cmd.code !== Cmd.ConditionalBranch) return;
            const type = Number(cmd.parameters[0]);
            if (type !== 0 && type !== 1) return;
            const kind = type === 0 ? "switch" : "variable";
            const id = Number(cmd.parameters[1]);
            const writes = collectPageWrites(life, map.id, ev.id, page.index, kind, id);

            if (writes.indexes.length === 0) return; // 完全未写 → read-never-written 负责
            if (writes.external.length > 0) return; // 页外有写入 → 无法证明
            const condIndex = loc.commandIndex ?? -1;
            if (writes.indexes.every((i) => i > condIndex)) {
              sections.push({
                type: "first-run-false",
                severity: "warning",
                confidence: "medium",
                location: loc,
                message: `首次触发时条件恒假：${kind === "switch" ? "开关" : "变量"} ${id} 的全部写入点位于本判断之后——事件需二次触发才可能进入此分支`,
                evidence: { kind, id, writesAfter: writes.indexes },
              });
            }
          });
        }
      }
    }
    return sections;
  },
};
