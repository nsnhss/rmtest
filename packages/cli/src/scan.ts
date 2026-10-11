/**
 * 扫描管线：加载工程 → 引用图 → checkers → 报告。
 * 与 CLI 入口分离，保证可测试。
 * incremental: 基于内容哈希的变更检测——无变更跳过重扫并报告"未变更"；
 * 有变更列出受影响文件。基线存项目库 meta（prev_file_hashes）。
 */
import path from "node:path";
import type { Locale } from "@rmtest/i18n";
import { checkers } from "@rmtest/checkers";
import { buildLifecycle, buildRefGraph, runCheckers, type CheckerPlugin } from "@rmtest/core";
import { renderReport } from "@rmtest/report";
import { ProjectStore } from "@rmtest/store";
import { loadProjectAny, type AnyLoadedProject } from "./loader.ts";

export interface ScanOptions {
  incremental?: boolean;
  /** 报告语言，默认中文 */
  locale?: Locale;
  /** 用户插件 checker（CLI --checkers <目录> 加载而来），与内置检查器合并执行 */
  checkers?: readonly CheckerPlugin[];
  /** 插件加载期错误（进入报告，触发"分析不完整"提示） */
  pluginErrors?: { plugin: string; message: string }[];
}

export interface ScanSummary {
  html: string;
  counts: { error: number; warning: number; info: number };
  pluginErrors: { plugin: string; message: string }[];
  loadWarnings: string[];
  fingerprint: string;
  /** null = 未启用增量或无基线 */
  changedFiles: string[] | null;
  /** 增量模式下无变更（未执行重扫） */
  unchanged: boolean;
}

const PREV_HASHES_KEY = "prev_file_hashes";

export function scan(projectDir: string, opts: ScanOptions = {}): ScanSummary {
  const loaded = loadProjectAny(projectDir).project;

  if (opts.incremental) {
    const store = new ProjectStore(path.join(projectDir, "rmtest.db"));
    try {
      const prevJson = store.getMeta(PREV_HASHES_KEY);
      const current = Object.fromEntries(loaded.fileHashes);
      const changedFiles: string[] = [];

      if (prevJson !== null) {
        const prev = JSON.parse(prevJson) as Record<string, string>;
        const allKeys = new Set([...Object.keys(prev), ...Object.keys(current)]);
        for (const key of allKeys) {
          if (prev[key] !== current[key]) changedFiles.push(key);
        }
        if (changedFiles.length === 0) {
          return {
            html: "",
            counts: { error: 0, warning: 0, info: 0 },
            pluginErrors: [],
            loadWarnings: [],
            fingerprint: loaded.fingerprint,
            changedFiles: [],
            unchanged: true,
          };
        }
      }
      store.setMeta(PREV_HASHES_KEY, JSON.stringify(current));
      const result = runFull(loaded, opts);
      return { ...result, changedFiles: prevJson === null ? null : changedFiles, unchanged: false };
    } finally {
      store.close();
    }
  }

  return { ...runFull(loaded, opts), changedFiles: null, unchanged: false };
}

function runFull(loaded: AnyLoadedProject, opts: ScanOptions): Omit<ScanSummary, "changedFiles" | "unchanged"> {
  const facts = {
    refgraph: buildRefGraph(loaded.ir),
    lifecycle: buildLifecycle(loaded.ir),
    universe: loaded.universe,
    assets: loaded.assets,
  };
  const result = runCheckers(opts.checkers ?? checkers, facts, loaded.ir);

  const counts = { error: 0, warning: 0, info: 0 };
  for (const s of result.sections) counts[s.severity]++;

  const pluginErrors = [...(opts.pluginErrors ?? []), ...result.errors];

  const html = renderReport({
    ir: loaded.ir,
    sections: result.sections,
    fingerprint: loaded.fingerprint,
    loadWarnings: loaded.warnings,
    pluginErrors,
    locale: opts.locale,
  });

  return {
    html,
    counts,
    pluginErrors,
    loadWarnings: loaded.warnings,
    fingerprint: loaded.fingerprint,
  };
}
