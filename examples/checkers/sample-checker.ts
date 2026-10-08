// ============================================================
// 示例 checker 插件 —— 演示用户自写检查器的完整契约。
//
// 分发方式：把这个文件放到任意目录，用加载器注册即可：
//   import { loadCheckersFromDir } from "@rmtest/checkers";
//   const { checkers, errors } = await loadCheckersFromDir("./我的插件目录");
// 或 CLI：插件目录路径传入 scan（见 README 插件生态一节）。
//
// 契约：
//   1. 默认导出 CheckerPlugin（或 CheckerPlugin[]）
//   2. manifest 声明 { name, version, irVersion, facts }
//   3. check(facts, ir) 返回 ReportSection[]（类型化报告，未知类型 UI 优雅降级）
// ============================================================
import type { CheckerPlugin, IRDocument, ReportSection } from "@rmtest/core";

export const sampleChecker: CheckerPlugin = {
  manifest: { name: "sample-empty-maps", version: "0.1.0", irVersion: 1, facts: [] },
  check(_facts, ir: IRDocument): ReportSection[] {
    const sections: ReportSection[] = [];
    for (const map of ir.maps) {
      if (map.events.length === 0) {
        sections.push({
          type: "sample-empty-maps",
          severity: "info",
          confidence: "medium",
          location: { mapId: map.id },
          message: `地图 ${map.id} (${map.name}) 没有任何事件（可能是空地图或事件被误删）`,
          evidence: { mapId: map.id },
        });
      }
    }
    return sections;
  },
};

export default sampleChecker;
