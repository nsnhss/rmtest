/**
 * CLI run —— 在真实引擎上执行场景 DSL。
 * 沙漏收口：校验闸门（静态引用必须真实存在）→ 真引擎执行 → 断言结果。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadProjectAny } from "./loader.ts";
import { ScenarioSchema, validateScenario, type Scenario } from "@rmtest/dsl";
import {
  closeRealGame,
  executeRealScenario,
  launchRealGame,
  waitGameReady,
  type RealScenarioResult,
} from "@rmtest/runtime";

export async function runScenarioCli(projectDir: string, scenarioPath: string): Promise<RealScenarioResult> {
  let scenario: Scenario;
  try {
    scenario = ScenarioSchema.parse(JSON.parse(readFileSync(scenarioPath, "utf8")));
  } catch (err) {
    throw new Error(`场景文件解析失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { engine, project: loaded } = loadProjectAny(projectDir);
  if (engine === "rgss") throw new Error("RGSS 动态执行未支持（静态分析可用：scan / deploy / maintain）");
  const validation = validateScenario(scenario, loaded.ir, loaded.universe);
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => i.message).join("; "));
  }

  const electronExe = path.resolve(import.meta.dirname, "../../../node_modules/electron/dist/electron.exe");
  const session = await launchRealGame(projectDir, { electronPath: electronExe });
  try {
    await waitGameReady(session.page);
    return await executeRealScenario(session.page, scenario);
  } finally {
    await closeRealGame(session);
  }
}
