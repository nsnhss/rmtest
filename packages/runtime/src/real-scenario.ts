/**
 * 真实引擎场景执行器 —— DSL 场景跑在真实 MV 引擎上。
 *
 * 与 stub 执行器的语义差异（诚实声明）：
 * - walk = 直接定位玩家（不模拟行走路径/碰撞）
 * - interact = 触发玩家脚下事件并驱动到结束（消息出现即按确定）
 * - choose = 暂不支持（对话选项导航待实现），显式失败而非假通过
 */
import type { Page } from "puppeteer-core";
import type { Scenario } from "@rmtest/dsl";
import { pressOk, snapshotReal, triggerAt, gotoMap, type RealSnapshot } from "./realengine.ts";

export interface RealScenarioResult {
  scenarioId: string;
  passed: boolean;
  stepResults: Array<{ index: number; type: string; passed: boolean; message?: string }>;
  finalSnapshot: RealSnapshot;
}

interface RealWindow {
  __rmtestReal: { setPlayer: (x: number, y: number) => void };
}

const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function executeRealScenario(page: Page, scenario: Scenario): Promise<RealScenarioResult> {
  const stepResults: RealScenarioResult["stepResults"] = [];
  let passedAll = true;

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i]!;
    let passed = true;
    let message: string | undefined;

    switch (step.type) {
      case "start_new_game": {
        const ok = await gotoMap(page);
        if (!ok) {
          passed = false;
          message = "进入地图场景失败";
        }
        break;
      }
      case "walk": {
        await page.evaluate(
          (pos: { x: number; y: number }) => (window as unknown as RealWindow).__rmtestReal.setPlayer(pos.x, pos.y),
          { x: step.to.x, y: step.to.y },
        );
        break;
      }
      case "interact": {
        const snap = await snapshotReal(page);
        await triggerAt(page, snap.playerX, snap.playerY);
        // 驱动事件到结束：消息出现就按确定
        const deadline = Date.now() + 20_000;
        for (;;) {
          const s = await snapshotReal(page);
          if (!s.eventRunning && !s.messageBusy) break;
          if (s.messageBusy) await pressOk(page);
          if (Date.now() > deadline) {
            passed = false;
            message = "事件未在 20s 内完成";
            break;
          }
          await sleepMs(100);
        }
        break;
      }
      case "assert_switch": {
        const s = await snapshotReal(page);
        const actual = s.switches[step.switchId] === true;
        passed = actual === step.value;
        if (!passed) message = `开关 ${step.switchId} 期望 ${step.value}，实际 ${actual}`;
        break;
      }
      case "assert_variable": {
        const s = await snapshotReal(page);
        const actual = s.variables[step.variableId] ?? 0;
        passed = actual === step.value;
        if (!passed) message = `变量 ${step.variableId} 期望 ${step.value}，实际 ${actual}`;
        break;
      }
      case "assert_map": {
        const s = await snapshotReal(page);
        passed = s.mapId === step.map;
        if (!passed) message = `地图期望 ${step.map}，实际 ${s.mapId}`;
        break;
      }
      case "choose":
        passed = false;
        message = "choose 在真实引擎执行器上暂不支持（对话选项导航待实现）";
        break;
    }

    stepResults.push({ index: i, type: step.type, passed, message });
    if (!passed) {
      passedAll = false;
      break;
    }
  }

  return { scenarioId: scenario.id, passed: passedAll, stepResults, finalSnapshot: await snapshotReal(page) };
}
