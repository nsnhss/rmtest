/**
 * CLI content —— 新内容检测：
 * 对比当前可达事件页全集与基线，报告新增/删除内容。
 * 新增可达内容 = 尚未有任何测试覆盖的候选，进补测队列。
 */
import { loadProjectAny } from "./loader.ts";
import { diffContentKeys, reachablePageKeys } from "@rmtest/core";

export interface ContentReport {
  /** 当前可达事件页 key 全集 */
  keys: string[];
  total: number;
  hasBaseline: boolean;
  added: string[];
  removed: string[];
}

export function contentReport(projectDir: string, baselineKeys?: readonly string[]): ContentReport {
  const loaded = loadProjectAny(projectDir).project;
  const keys = reachablePageKeys(loaded.ir);
  if (!baselineKeys) return { keys, total: keys.length, hasBaseline: false, added: [], removed: [] };
  const diff = diffContentKeys(baselineKeys, keys);
  return { keys, total: keys.length, hasBaseline: true, added: diff.added, removed: diff.removed };
}
