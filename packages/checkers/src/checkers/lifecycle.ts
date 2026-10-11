/**
 * 生命周期检查 —— 条件恒假与死逻辑。
 * 基于生命周期 facts：读全集/写全集的集合差。
 * 脚本调用（355/655）不解析，故置信度保守（medium/low），消息中注明。
 */
import { type CheckerPlugin, formatLocation, type Lifecycle, type ReportSection, type SwitchUse } from "@rmtest/core";
import type { LocalizableMessage } from "@rmtest/i18n";
import { core } from "../i18n/core.ts";

const KIND_LABEL: Record<"switch" | "variable", LocalizableMessage> = {
  switch: core("checker.core.kind.switch"),
  variable: core("checker.core.kind.variable"),
};

function firstRead(u: SwitchUse) {
  return u.reads[0];
}

function reportNeverWritten(kind: "switch" | "variable", life: Lifecycle, sections: ReportSection[]): void {
  const map = kind === "switch" ? life.switches : life.variables;
  const label = KIND_LABEL[kind];
  for (const [id, use] of map) {
    if (id <= 0) continue;
    if (use.reads.length > 0 && use.writes.length === 0) {
      sections.push({
        type: "read-never-written",
        severity: "error",
        confidence: "medium",
        location: firstRead(use),
        ...core("checker.core.readNeverWritten", { kind: label, id }),
        evidence: { kind: label.message, id, readCount: use.reads.length },
      });
    }
  }
}

function reportNeverRead(kind: "switch" | "variable", life: Lifecycle, sections: ReportSection[]): void {
  const map = kind === "switch" ? life.switches : life.variables;
  const label = KIND_LABEL[kind];
  for (const [id, use] of map) {
    if (id <= 0) continue;
    if (use.writes.length > 0 && use.reads.length === 0) {
      sections.push({
        type: "written-never-read",
        severity: "info",
        confidence: "low",
        location: use.writes[0],
        ...core("checker.core.writtenNeverRead", { kind: label, id }),
        evidence: { kind: label.message, id, writeCount: use.writes.length },
      });
    }
  }
}

export const readNeverWrittenChecker: CheckerPlugin = {
  manifest: { name: "read-never-written", version: "0.1.0", irVersion: 1, facts: ["lifecycle"] },
  check(facts) {
    const life = facts["lifecycle"] as Lifecycle;
    const sections: ReportSection[] = [];
    reportNeverWritten("switch", life, sections);
    reportNeverWritten("variable", life, sections);
    return sections;
  },
};

export const writtenNeverReadChecker: CheckerPlugin = {
  manifest: { name: "written-never-read", version: "0.1.0", irVersion: 1, facts: ["lifecycle"] },
  check(facts) {
    const life = facts["lifecycle"] as Lifecycle;
    const sections: ReportSection[] = [];
    reportNeverRead("switch", life, sections);
    reportNeverRead("variable", life, sections);
    return sections;
  },
};

export { formatLocation };
