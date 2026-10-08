/**
 * 扫描管线：加载工程 → 引用图 → checkers → 报告。
 * 与 CLI 入口分离，保证可测试。
 */
import { loadProject } from "@rmtest/adapter-mv";
import { checkers } from "@rmtest/checkers";
import { buildRefGraph, runCheckers } from "@rmtest/core";
import { renderReport } from "@rmtest/report";

export interface ScanSummary {
  html: string;
  counts: { error: number; warning: number; info: number };
  pluginErrors: { plugin: string; message: string }[];
  loadWarnings: string[];
  fingerprint: string;
}

export function scan(projectDir: string): ScanSummary {
  const loaded = loadProject(projectDir);
  const facts = { refgraph: buildRefGraph(loaded.ir), universe: loaded.universe, assets: loaded.assets };
  const result = runCheckers(checkers, facts, loaded.ir);

  const counts = { error: 0, warning: 0, info: 0 };
  for (const s of result.sections) counts[s.severity]++;

  const html = renderReport({
    ir: loaded.ir,
    sections: result.sections,
    fingerprint: loaded.fingerprint,
    loadWarnings: loaded.warnings,
    pluginErrors: result.errors,
  });

  return {
    html,
    counts,
    pluginErrors: result.errors,
    loadWarnings: loaded.warnings,
    fingerprint: loaded.fingerprint,
  };
}
