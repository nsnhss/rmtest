/**
 * 资源规格检查 —— 行走图/脸图尺寸必须匹配引擎格子。
 * MV 标准：行走图 3 列 × 4 行 × 48px（$ 前缀为单角色，仅要求 3×4 格）；脸图每格 144×144。
 */
import { type CheckerPlugin, type RefGraph, type ReportSection } from "@rmtest/core";
import type { LocalizableMessage } from "@rmtest/i18n";
import type { AssetRecord } from "../asset.ts";
import { core } from "../i18n/core.ts";

export interface AssetFacts {
  refgraph: RefGraph;
  assets: AssetRecord[];
}

export const assetDimensionChecker: CheckerPlugin = {
  manifest: { name: "asset-dimension", version: "0.1.0", irVersion: 1, facts: ["refgraph", "assets"] },
  check(facts, ir) {
    // 规格是 MV/MZ 的（行走图 144×192、脸图 144×144）；其它引擎格子尺寸未建模，直接空转避免系统性误报
    if (ir.engine !== "mv" && ir.engine !== "mz") return [];
    const { refgraph, assets } = facts as unknown as AssetFacts;
    const byPath = new Map(assets.map((a) => [a.relPath, a]));
    const referenced = new Set(refgraph.refs.filter((r) => r.category === "asset").map((r) => r.target));
    const sections: ReportSection[] = [];

    for (const target of referenced) {
      const info = byPath.get(target);
      if (!info) continue; // 缺失由 dangling-ref 报
      let problem: LocalizableMessage | null = null;

      if (target.startsWith("img/characters/")) {
        const base = target.split("/").pop()!;
        if (base.startsWith("$")) {
          if (info.width % 3 !== 0 || info.height % 4 !== 0) {
            problem = core("checker.core.assetDimensionSingleCharSheet", {
              target,
              width: info.width,
              height: info.height,
            });
          }
        } else if (info.width % 144 !== 0 || info.height % 192 !== 0) {
          problem = core("checker.core.assetDimensionCharSheet", { target, width: info.width, height: info.height });
        }
      } else if (target.startsWith("img/faces/")) {
        if (info.width % 144 !== 0 || info.height % 144 !== 0) {
          problem = core("checker.core.assetDimensionFace", { target, width: info.width, height: info.height });
        }
      }

      if (problem) {
        const ref = refgraph.refs.find((r) => r.target === target);
        sections.push({
          type: "asset-dimension",
          severity: "error",
          confidence: "high",
          location: ref?.location,
          ...problem,
          evidence: { width: info.width, height: info.height },
        });
      }
    }
    return sections;
  },
};
