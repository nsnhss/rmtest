/**
 * CLI regress —— 一键回归：语料库全部场景在真实引擎上跑一遍。
 * 时效性保护：broken（引用失效）跳过并在报告中说明；fresh/stale 照跑。
 * 结果写入项目库（results 表），历史可查。
 */
import path from "node:path";
import { loadProjectAny } from "./loader.ts";
import { ScenarioSchema } from "@rmtest/dsl";
import { maintenanceReport } from "@rmtest/freshness";
import {
  closeRealGame,
  executeRealScenario,
  launchRealGame,
  waitGameReady,
} from "@rmtest/runtime";
import { ProjectStore } from "@rmtest/store";

export interface RegressItem {
  scenarioId: string;
  status: "fresh" | "stale" | "broken";
  outcome: "passed" | "failed" | "skipped" | "pending";
  message?: string;
}

export interface RegressSummary {
  items: RegressItem[];
  passed: number;
  failed: number;
  skipped: number;
}

export async function regressCli(projectDir: string): Promise<RegressSummary> {
  const { engine, project: loaded } = loadProjectAny(projectDir);
  if (engine === "rgss") throw new Error("RGSS 动态执行未支持");
  const store = new ProjectStore(path.join(projectDir, "rmtest.db"));
  const stored = store.listScenarios();

  const scenarios = stored.map((s) => ScenarioSchema.parse(JSON.parse(s.json)));
  const report = maintenanceReport(scenarios, loaded.ir, loaded.universe, loaded.fingerprint);
  const byId = new Map(scenarios.map((s) => [s.id, s]));

  const items: RegressItem[] = [];
  const toRun: string[] = [];
  for (const item of report.items) {
    if (item.status === "broken") {
      items.push({ scenarioId: item.scenarioId, status: "broken", outcome: "skipped", message: item.issues.join("; ") });
      continue;
    }
    items.push({ scenarioId: item.scenarioId, status: item.status, outcome: "pending" });
    toRun.push(item.scenarioId);
  }

  if (toRun.length > 0) {
    const electronExe = path.resolve(import.meta.dirname, "../../../node_modules/electron/dist/electron.exe");
    const session = await launchRealGame(projectDir, { electronPath: electronExe });
    try {
      await waitGameReady(session.page);
      for (const id of toRun) {
        const scenario = byId.get(id)!;
        const item = items.find((i) => i.scenarioId === id)!;
        let passed: boolean;
        let failMessage: string | undefined;
        try {
          const result = await executeRealScenario(session.page, scenario);
          passed = result.passed;
          failMessage = result.stepResults.find((s) => !s.passed)?.message;
          store.recordResult({
            scenarioId: scenario.id,
            passed: result.passed,
            stepResultsJson: JSON.stringify(result.stepResults),
            snapshotJson: JSON.stringify(result.finalSnapshot),
          });
        } catch (err) {
          passed = false;
          failMessage = err instanceof Error ? err.message : String(err);
        }
        item.outcome = passed ? "passed" : "failed";
        item.message = failMessage;
      }
    } finally {
      await closeRealGame(session);
    }
  }
  store.close();

  const passed = items.filter((i) => i.outcome === "passed").length;
  const failed = items.filter((i) => i.outcome === "failed").length;
  const skipped = items.filter((i) => i.outcome === "skipped").length;
  return { items, passed, failed, skipped };
}
