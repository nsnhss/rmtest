/**
 * TyranoScript（含 TyranoBuilder）静态检查器。
 * 只在 IR 含 tyrano 段时产出报告；MV/MZ/RGSS 工程一律空转。
 */
import type { CheckerPlugin, IRTyranoSection, ReportSection } from "@rmtest/core";
import type { LocalizableMessage } from "@rmtest/i18n";
import { tyrano } from "../i18n/tyrano.ts";

type TSection = IRTyranoSection;

const NO_SECTIONS: ReportSection[] = [];

function sec(
  type: string,
  severity: ReportSection["severity"],
  confidence: ReportSection["confidence"],
  message: LocalizableMessage,
  evidence?: unknown,
): ReportSection {
  return {
    type,
    severity,
    confidence,
    message: message.message,
    messageId: message.messageId,
    messageParams: message.messageParams,
    evidence,
  };
}

/** 跳转/调用/按钮/链接 → 目标场景文件或标签不存在 */
export const tyranoBrokenJumpChecker: CheckerPlugin = {
  manifest: { name: "tyrano-broken-jump", version: "0.1.0", irVersion: 2, facts: [] },
  check(_facts, ir) {
    const t = ir.tyrano;
    if (!t) return NO_SECTIONS;
    const labelSets = new Map(t.scenarios.map((s) => [s.file, new Set(s.labels.map((l) => l.name))]));
    const out: ReportSection[] = [];
    for (const s of t.scenarios) {
      for (const l of s.labels) {
        for (const j of l.jumps) {
          const targetFile = j.storage ?? s.file;
          const labels = labelSets.get(targetFile);
          if (!labels) {
            out.push(
              sec(
                "tyrano-broken-jump",
                "error",
                "high",
                tyrano("checker.tyrano.brokenJumpMissingScenario", {
                  file: s.file,
                  label: l.name,
                  line: j.line,
                  kind: j.kind,
                  targetFile,
                }),
                { file: s.file, label: l.name, line: j.line },
              ),
            );
            continue;
          }
          if (j.target !== null && !labels.has(j.target)) {
            out.push(
              sec(
                "tyrano-broken-jump",
                "error",
                "high",
                tyrano("checker.tyrano.brokenJumpMissingLabel", {
                  file: s.file,
                  label: l.name,
                  line: j.line,
                  kind: j.kind,
                  target: j.target,
                  targetFile,
                }),
                { file: s.file, label: l.name, line: j.line, target: j.target },
              ),
            );
          }
        }
      }
    }
    return out;
  },
};

/** 引用的图片/音频/视频不存在（大小写不一致降级 warning） */
export const tyranoMissingAssetChecker: CheckerPlugin = {
  manifest: { name: "tyrano-missing-asset", version: "0.1.0", irVersion: 2, facts: [] },
  check(_facts, ir) {
    const t = ir.tyrano;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    for (const s of t.scenarios) {
      for (const l of s.labels) {
        for (const a of l.assets) {
          if (a.storage === null) continue;
          if (t.assets[a.kind].includes(a.storage)) continue;
          const lower = a.storage.toLowerCase();
          const evidence = { file: s.file, label: l.name, line: a.line, kind: a.kind, storage: a.storage };
          if (t.assets[a.kind].some((f) => f.toLowerCase() === lower)) {
            out.push(
              sec(
                "tyrano-missing-asset",
                "warning",
                "low",
                tyrano("checker.tyrano.assetCaseMismatch", {
                  file: s.file,
                  label: l.name,
                  line: a.line,
                  kind: a.kind,
                  storage: a.storage,
                }),
                evidence,
              ),
            );
          } else {
            out.push(
              sec(
                "tyrano-missing-asset",
                "error",
                "high",
                tyrano("checker.tyrano.assetMissing", {
                  file: s.file,
                  label: l.name,
                  line: a.line,
                  kind: a.kind,
                  storage: a.storage,
                }),
                evidence,
              ),
            );
          }
        }
      }
    }
    return out;
  },
};

/** 无条件跳回自身 → 死循环（前面出现 if/elsif 则视为合法的条件循环） */
export const tyranoSelfLoopChecker: CheckerPlugin = {
  manifest: { name: "tyrano-self-loop", version: "0.1.0", irVersion: 2, facts: [] },
  check(_facts, ir) {
    const t = ir.tyrano;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    for (const s of t.scenarios) {
      for (const l of s.labels) {
        for (const j of l.jumps) {
          if (j.kind !== "jump") continue;
          if ((j.storage ?? s.file) !== s.file || j.target !== l.name || j.precededByCondition) continue;
          out.push(
            sec(
              "tyrano-self-loop",
              "error",
              "high",
              tyrano("checker.tyrano.selfLoop", { file: s.file, label: l.name, line: j.line }),
              { file: s.file, label: l.name, line: j.line },
            ),
          );
        }
      }
    }
    return out;
  },
};

/** 入口场景缺失 → 游戏无法启动 */
export const tyranoEntryChecker: CheckerPlugin = {
  manifest: { name: "tyrano-entry", version: "0.1.0", irVersion: 2, facts: [] },
  check(_facts, ir) {
    const t = ir.tyrano;
    if (!t) return NO_SECTIONS;
    const files = new Set(t.scenarios.map((s) => s.file));
    if (files.has(t.entryScenario)) return NO_SECTIONS;
    return [
      sec("tyrano-entry", "error", "high", tyrano("checker.tyrano.entryScenarioMissing", { entryScenario: t.entryScenario }), {
        entryScenario: t.entryScenario,
      }),
    ];
  },
};

/** 标签无任何静态跳转指向（动态跳转/iscript 可达则忽略 → info/low） */
export const tyranoUnreachableLabelChecker: CheckerPlugin = {
  manifest: { name: "tyrano-unreachable-label", version: "0.1.0", irVersion: 2, facts: [] },
  check(_facts, ir) {
    const t = ir.tyrano;
    if (!t) return NO_SECTIONS;
    const targeted = new Set<string>();
    for (const s of t.scenarios) {
      for (const l of s.labels) {
        for (const j of l.jumps) {
          if (j.target !== null) targeted.add(`${j.storage ?? s.file}#${j.target}`);
        }
      }
    }
    const entryKey = `${t.entryScenario}#${t.entryLabel.replace(/^\*/, "")}`;
    const out: ReportSection[] = [];
    for (const s of t.scenarios) {
      for (const l of s.labels) {
        const key = `${s.file}#${l.name}`;
        if (key === entryKey) continue;
        if (!targeted.has(key)) {
          out.push(
            sec(
              "tyrano-unreachable-label",
              "info",
              "low",
              tyrano("checker.tyrano.unreachableLabel", { file: s.file, label: l.name }),
              { file: s.file, label: l.name },
            ),
          );
        }
      }
    }
    return out;
  },
};

/** if/macro 结构语法错误 */
export const tyranoSyntaxChecker: CheckerPlugin = {
  manifest: { name: "tyrano-syntax", version: "0.1.0", irVersion: 2, facts: [] },
  check(_facts, ir) {
    const t = ir.tyrano;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    for (const s of t.scenarios) {
      for (const e of s.syntaxErrors) {
        out.push(sec("tyrano-syntax", "error", "high", tyrano("checker.tyrano.syntaxError", { file: s.file, line: e.line, message: e.message }), { file: s.file, line: e.line }));
      }
    }
    return out;
  },
};

export function tyranoCheckers(): CheckerPlugin[] {
  return [
    tyranoBrokenJumpChecker,
    tyranoMissingAssetChecker,
    tyranoSelfLoopChecker,
    tyranoEntryChecker,
    tyranoUnreachableLabelChecker,
    tyranoSyntaxChecker,
  ];
}
