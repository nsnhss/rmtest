/**
 * 插件契约 —— checker/probe/facts-provider 的统一注册形态。
 * 内核是薄编排层：收集 facts → 跑插件 → 聚合报告。零检查逻辑。
 */
import type { IRDocument } from "./ir.ts";
import type { ReportSection } from "./report.ts";

export interface PluginManifest {
  name: string;
  version: string;
  /** 依赖的 IR schema 版本，加载时做兼容闸门 */
  irVersion: number;
  /** 依赖的 facts 名称 */
  facts: string[];
}

export interface CheckerPlugin {
  manifest: PluginManifest;
  check(facts: Facts, ir: IRDocument): ReportSection[];
}

export interface ProbePlugin {
  manifest: PluginManifest;
  /** 动态探针：在游戏运行时上执行并产出报告 section 与覆盖计数 */
  probe(runtime: unknown): Promise<ReportSection[]>;
}

/** facts 注册表：facts provider 贡献的类型化事实集合 */
export type Facts = Record<string, unknown>;
