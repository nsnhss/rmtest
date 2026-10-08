/**
 * CLI deploy —— 部署产物验收（分发版专项）。
 * 对部署产物（含加密）跑扫描，聚焦部署特有风险：
 * 大小写不一致（Linux/移动端必炸）、加密资源解析、字体缺失。
 */
import { loadProjectAny } from "./loader.ts";
import { checkers } from "@rmtest/checkers";
import { buildLifecycle, buildRefGraph, runCheckers } from "@rmtest/core";

export interface DeployReport {
  counts: { error: number; warning: number; info: number };
  /** 大小写不一致的引用数（部署到 Linux/移动端会缺失） */
  caseMismatches: number;
  /** 加密资源是否成功解析 */
  encryptedAssetsDetected: boolean;
}

export function deployReport(projectDir: string): DeployReport {
  const loaded = loadProjectAny(projectDir).project;
  const facts = {
    refgraph: buildRefGraph(loaded.ir),
    lifecycle: buildLifecycle(loaded.ir),
    universe: loaded.universe,
    assets: loaded.assets,
  };
  const result = runCheckers(checkers, facts, loaded.ir);

  const counts = { error: 0, warning: 0, info: 0 };
  let caseMismatches = 0;
  for (const s of result.sections) {
    counts[s.severity]++;
    if (s.type === "dangling-ref" && s.confidence === "low") caseMismatches++;
  }

  return {
    counts,
    caseMismatches,
    encryptedAssetsDetected: loaded.warnings.length === 0 && loaded.assets.length > 0,
  };
}
