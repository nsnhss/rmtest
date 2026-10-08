/**
 * 真实引擎场景执行器 —— DSL 场景跑在真实 MV 引擎上。
 *
 * 语义（真实引擎保真）：
 * - walk = 瓦片通行性 BFS 路径模拟（忽略事件阻挡——事件是交互目标），路径不可达即失败
 * - interact = 面向触发：先前方一格再脚下（覆盖"站在事件上"与"面向事件"两种交互）
 * - choose = 方向键导航到选项 + 确定，再驱动事件到结束
 */
import type { Page } from "puppeteer-core";
import type { Scenario } from "@rmtest/dsl";
import { pressKey, pressOk, snapshotReal, triggerFront, gotoMap, walkPathTo, type RealSnapshot } from "./realengine.ts";

export interface RealScenarioResult {
  scenarioId: string;
  passed: boolean;
  stepResults: Array<{ index: number; type: string; passed: boolean; message?: string }>;
  finalSnapshot: RealSnapshot;
}

const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function driveEventToEnd(
  page: Page,
  timeoutMs = 20_000,
  opts: { confirmChoices?: boolean } = {},
): Promise<{ ok: boolean; outcome: "done" | "choice"; message?: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const s = await snapshotReal(page);
    if (!s.eventRunning && !s.messageBusy && !s.choiceActive) return { ok: true, outcome: "done" };
    if (s.choiceActive) {
      if (opts.confirmChoices) {
        // 单次按键可能被帧循环吞掉 → 重试直到选项被消费
        await pressOk(page);
        await sleepMs(120);
        continue;
      }
      return { ok: true, outcome: "choice" }; // 对话分支：交给 choose 步骤
    }
    if (s.messageBusy) await pressOk(page);
    if (Date.now() > deadline) return { ok: false, outcome: "done", message: "事件未在 20s 内完成" };
    await sleepMs(100);
  }
}

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
        const ok = await walkPathTo(page, step.to.x, step.to.y);
        if (!ok) {
          passed = false;
          message = `路径不可达: (${step.to.x}, ${step.to.y}) 被瓦片阻挡`;
        }
        break;
      }
      case "interact": {
        const snap = await snapshotReal(page);
        await triggerFront(page, snap.playerX, snap.playerY, step.direction);
        const driven = await driveEventToEnd(page);
        if (!driven.ok) {
          passed = false;
          message = driven.message;
        } else if (driven.outcome === "choice") {
          message = "对话分支出现（交给 choose 步骤）";
        }
        break;
      }
      case "choose": {
        // 选项窗口有打开动画：等它真正激活再按键
        const winDeadline = Date.now() + 5_000;
        for (;;) {
          const s = await snapshotReal(page);
          if (s.choiceWindowActive) break;
          if (Date.now() > winDeadline) {
            passed = false;
            message = "选项窗口未在 5s 内激活";
            break;
          }
          await sleepMs(100);
        }
        if (!passed) break;
        // 导航到目标选项：按一次 → 等光标变化 → 没变才重试（防吞键、防冲过头）
        for (let n = 0; n < step.index; n++) {
          let attempts = 0;
          for (;;) {
            const before = (await snapshotReal(page)).choiceIndex;
            await pressKey(page, "down");
            const changeDeadline = Date.now() + 500;
            for (;;) {
              const s = await snapshotReal(page);
              if (s.choiceIndex !== before) break;
              if (Date.now() > changeDeadline) break;
              await sleepMs(80);
            }
            if ((await snapshotReal(page)).choiceIndex !== before) break;
            attempts++;
            if (attempts >= 3) {
              passed = false;
              message = "选项光标未响应按键";
              break;
            }
          }
          if (!passed) break;
        }
        if (!passed) break;
        if ((await snapshotReal(page)).choiceIndex !== step.index) {
          passed = false;
          message = `选项光标位置不符（期望 ${step.index}，实际 ${(await snapshotReal(page)).choiceIndex}）`;
          break;
        }
        await pressOk(page);
        const driven = await driveEventToEnd(page, 20_000, { confirmChoices: true });
        if (!driven.ok) {
          passed = false;
          message = driven.message;
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
    }

    stepResults.push({ index: i, type: step.type, passed, message });
    if (!passed) {
      passedAll = false;
      break;
    }
  }

  return { scenarioId: scenario.id, passed: passedAll, stepResults, finalSnapshot: await snapshotReal(page) };
}
