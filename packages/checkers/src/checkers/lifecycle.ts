/**
 * 生命周期检查 —— 条件恒假与死逻辑。
 * 基于生命周期 facts：读全集/写全集的集合差。
 * 脚本调用（355/655）不解析，故置信度保守（medium/low），消息中注明。
 */
import { type CheckerPlugin, formatLocation, type Lifecycle, type ReportSection, type SwitchUse } from "@rmtest/core";

function firstRead(u: SwitchUse) {
  return u.reads[0];
}

function reportNeverWritten(kind: "开关" | "变量", life: Lifecycle, sections: ReportSection[]): void {
  const map = kind === "开关" ? life.switches : life.variables;
  for (const [id, use] of map) {
    if (id <= 0) continue;
    if (use.reads.length > 0 && use.writes.length === 0) {
      sections.push({
        type: "read-never-written",
        severity: "error",
        confidence: "medium",
        location: firstRead(use),
        message: `${kind} ${id} 被读取但事件层从未写入 —— 条件恒为假/恒为初始值，相关分支永不触发（脚本写入不计入）`,
        evidence: { kind, id, readCount: use.reads.length },
      });
    }
  }
}

function reportNeverRead(kind: "开关" | "变量", life: Lifecycle, sections: ReportSection[]): void {
  const map = kind === "开关" ? life.switches : life.variables;
  for (const [id, use] of map) {
    if (id <= 0) continue;
    if (use.writes.length > 0 && use.reads.length === 0) {
      sections.push({
        type: "written-never-read",
        severity: "info",
        confidence: "low",
        location: use.writes[0],
        message: `${kind} ${id} 被写入但从未被读取 —— 死逻辑或写错了开关号（脚本读取不计入）`,
        evidence: { kind, id, writeCount: use.writes.length },
      });
    }
  }
}

export const readNeverWrittenChecker: CheckerPlugin = {
  manifest: { name: "read-never-written", version: "0.1.0", irVersion: 1, facts: ["lifecycle"] },
  check(facts) {
    const life = facts["lifecycle"] as Lifecycle;
    const sections: ReportSection[] = [];
    reportNeverWritten("开关", life, sections);
    reportNeverWritten("变量", life, sections);
    return sections;
  },
};

export const writtenNeverReadChecker: CheckerPlugin = {
  manifest: { name: "written-never-read", version: "0.1.0", irVersion: 1, facts: ["lifecycle"] },
  check(facts) {
    const life = facts["lifecycle"] as Lifecycle;
    const sections: ReportSection[] = [];
    reportNeverRead("开关", life, sections);
    reportNeverRead("变量", life, sections);
    return sections;
  },
};

export { formatLocation };
