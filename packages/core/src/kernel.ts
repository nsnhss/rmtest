/**
 * 内核 —— 薄编排层：收集 facts → 跑插件 → 聚合报告。
 * 检查逻辑一律在插件里；内核只做加载、隔离、聚合。
 */
import { IR_SCHEMA_VERSION, type IRDocument } from "./ir.ts";
import type { CheckerPlugin } from "./plugin.ts";
import type { ReportSection } from "./report.ts";

export interface CheckRunResult {
  sections: ReportSection[];
  /** 插件级失败：manifest 不兼容或插件抛异常（单插件崩溃只降级，不带崩全局） */
  errors: { plugin: string; message: string }[];
}

export function runCheckers(
  checkers: readonly CheckerPlugin[],
  facts: Record<string, unknown>,
  ir: IRDocument,
): CheckRunResult {
  const sections: ReportSection[] = [];
  const errors: CheckRunResult["errors"] = [];

  for (const checker of checkers) {
    const m = checker.manifest;
    if (m.irVersion > IR_SCHEMA_VERSION) {
      errors.push({ plugin: m.name, message: `依赖 IR v${m.irVersion}，当前 v${IR_SCHEMA_VERSION}，不兼容` });
      continue;
    }
    const missing = m.facts.filter((f) => !(f in facts));
    if (missing.length > 0) {
      errors.push({ plugin: m.name, message: `缺少 facts: ${missing.join(", ")}` });
      continue;
    }
    try {
      sections.push(...checker.check(facts, ir));
    } catch (err) {
      errors.push({ plugin: m.name, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { sections, errors };
}
