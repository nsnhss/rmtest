/**
 * 场景执行器 —— 把 DSL 场景投递到游戏运行时（页面内），逐步执行并收集断言结果。
 * 失败即停：断言失败后的步骤无意义。最终快照供轨迹/证据使用。
 */
import type { Scenario, ScenarioStep } from "@rmtest/dsl";
import type { Page } from "puppeteer-core";

export interface ScenarioStepResult {
  index: number;
  type: string;
  passed: boolean;
  message?: string;
}

export interface GameSnapshot {
  mapId: number;
  x: number;
  y: number;
  switches: Record<string, boolean>;
  variables: Record<string, number>;
  transfer: { mapId: number; x: number; y: number } | null;
}

export interface ScenarioResult {
  scenarioId: string;
  passed: boolean;
  stepResults: ScenarioStepResult[];
  finalSnapshot: GameSnapshot;
}

// 页面契约：fixture.html 暴露的 __game 表面
interface GamePage {
  startNewGame: () => void;
  walk: (x: number, y: number) => void;
  interact: () => void;
  choose: () => void;
  snapshot: () => GameSnapshot;
}
interface GameWindow {
  __game: GamePage;
}

export async function executeScenario(page: Page, scenario: Scenario): Promise<ScenarioResult> {
  const raw = await page.evaluate((steps) => {
    const pageWindow = window as unknown as GameWindow; // 页面上下文：window 形状由 fixture.html 定义
    const game = pageWindow.__game;
    const results: Array<{ index: number; type: string; passed: boolean; message?: string }> = [];

    const runStep = (step: ScenarioStep): { passed: boolean; message?: string } => {
      switch (step.type) {
        case "start_new_game":
          game.startNewGame();
          return { passed: true };
        case "walk":
          game.walk(step.to.x, step.to.y);
          return { passed: true };
        case "interact":
          game.interact();
          return { passed: true };
        case "choose":
          game.choose();
          return { passed: true };
        case "assert_switch": {
          const actual = !!game.snapshot().switches[step.switchId];
          return actual === step.value
            ? { passed: true }
            : { passed: false, message: `开关 ${step.switchId} 期望 ${step.value}，实际 ${actual}` };
        }
        case "assert_variable": {
          const actual = game.snapshot().variables[step.variableId] ?? 0;
          return actual === step.value
            ? { passed: true }
            : { passed: false, message: `变量 ${step.variableId} 期望 ${step.value}，实际 ${actual}` };
        }
        case "assert_map": {
          const snap = game.snapshot();
          const current = snap.transfer ? snap.transfer.mapId : snap.mapId;
          return current === step.map
            ? { passed: true }
            : { passed: false, message: `所在/传送目标地图期望 ${step.map}，实际 ${current}` };
        }
      }
    };

    for (const step of steps) {
      const r = runStep(step);
      results.push({ index: results.length, type: step.type, passed: r.passed, message: r.message });
      if (!r.passed) break; // 失败即停
    }
    return { results, snapshot: game.snapshot() };
  }, scenario.steps as ScenarioStep[]) as { results: ScenarioStepResult[]; snapshot: GameSnapshot };

  return {
    scenarioId: scenario.id,
    passed: raw.results.every((r) => r.passed),
    stepResults: raw.results,
    finalSnapshot: raw.snapshot,
  };
}
