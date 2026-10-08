/**
 * CLI maintain —— 测试语料维护报告。
 * 对真实工程纯静态可用：三分类（fresh/broken/stale）+ broken 引用机械重链。
 */
import { loadProjectAny } from "./loader.ts";
import { ScenarioSchema, type Scenario } from "@rmtest/dsl";
import { maintenanceReport, relinkScenario, type MaintenanceReport } from "@rmtest/freshness";

export interface MaintainOutcome {
  report: MaintenanceReport;
  /** 重链成功的引用数 */
  relinked: number;
  /** 无法重链的引用数 */
  unresolved: number;
  /** 重链后的语料（apply 时写回） */
  corpus: Scenario[];
  /** 语料文件里的非法条目 */
  badEntries: string[];
}

export function maintain(projectDir: string, rawCorpus: unknown[]): MaintainOutcome {
  const loaded = loadProjectAny(projectDir).project;
  const corpus: Scenario[] = [];
  const badEntries: string[] = [];

  rawCorpus.forEach((entry, i) => {
    const parsed = ScenarioSchema.safeParse(entry);
    if (!parsed.success) {
      badEntries.push(`条目 ${i + 1}: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
      return;
    }
    corpus.push(parsed.data);
  });

  const report = maintenanceReport(corpus, loaded.ir, loaded.universe, loaded.fingerprint);

  let relinked = 0;
  let unresolved = 0;
  const finalCorpus = corpus.map((s) => {
    const status = report.items.find((i) => i.scenarioId === s.id)!.status;
    if (status !== "broken") return s;
    const outcome = relinkScenario(s, loaded.ir, loaded.fileHashes);
    relinked += outcome.relinked.length;
    unresolved += outcome.unresolved.length;
    return outcome.scenario;
  });

  return { report, relinked, unresolved, corpus: finalCorpus, badEntries };
}
