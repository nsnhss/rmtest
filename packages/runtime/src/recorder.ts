/**
 * 录制器 —— 在真实引擎页面上捕获键盘输入，翻译成 DSL 场景步骤。
 *
 * 键位映射（真实游戏交互语义）：
 * - 方向键/WSAD = 移动一格（连续移动合并为 walk 步骤）
 * - Enter/空格 = 确认：消息等待中按 = 确认对话；否则 = 交互（触发脚下事件）
 * - Esc = 停止录制
 *
 * 录制产物是纯 DSL 场景，用 executeRealScenario 回放验证。
 */
import type { Page } from "puppeteer-core";
import { ScenarioSchema, type Scenario, type ScenarioStep } from "@rmtest/dsl";
import { pressOk, snapshotReal, triggerAt } from "./realengine.ts";

export interface RecorderOptions {
  scenarioId?: string;
}

export interface RecordingHandle {
  /** 停止录制并产出场景 */
  stop: () => Promise<Scenario>;
}

const DIRECTION_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

const RECORDER_SCRIPT = `(() => {
  if (window.__rmtestRecorder) return "exists";
  const events = [];
  window.__rmtestRecorder = {
    events,
    onKey(key) { events.push(key); },
  };
  window.addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    window.__rmtestRecorder.events.push(k);
  });
  return "injected";
})()`;

interface RecorderWindow {
  __rmtestRecorder: { events: string[] };
  __rmtestReal: { setPlayer: (x: number, y: number) => void };
}

const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function startRecording(page: Page, opts: RecorderOptions = {}): Promise<RecordingHandle> {
  await page.evaluate(RECORDER_SCRIPT);
  await page.evaluate(() => {
    (window as unknown as RecorderWindow).__rmtestRecorder.events.length = 0;
  });

  // 录制从当前状态开始：场景第一帧记录当前位置
  const start = await snapshotReal(page);
  const steps: ScenarioStep[] = [{ type: "start_new_game" }];
  let pendingDirection: [number, number] | null = null;
  let pendingSteps = 0;

  const poll = async (): Promise<void> => {
    for (;;) {
      await sleepMs(50);
      const keys = (await page.evaluate(() => {
        const w = window as unknown as RecorderWindow;
        const ev = w.__rmtestRecorder.events.splice(0);
        return ev;
      })) as string[];

      for (const key of keys) {
        if (key === "Escape") return; // 停止
        const dir = DIRECTION_KEYS[key];
        if (dir) {
          pendingDirection = dir;
          continue;
        }
        if (key === "Enter" || key === " ") {
          // 冲掉未消费的移动（方向已被应用消费，只看累计步数）
          if (pendingSteps > 0) {
            const s = await snapshotReal(page);
            steps.push({ type: "walk", to: { map: s.mapId, x: s.playerX, y: s.playerY } });
            pendingSteps = 0;
          }
          const s = await snapshotReal(page);
          if (s.messageBusy) {
            await pressOk(page);
          } else {
            steps.push({ type: "interact", direction: "up" });
            await triggerAt(page, s.playerX, s.playerY);
            // 事件带消息时自动确认到结束
            const deadline = Date.now() + 20_000;
            for (;;) {
              const t = await snapshotReal(page);
              if (!t.eventRunning && !t.messageBusy) break;
              if (t.messageBusy) await pressOk(page);
              if (Date.now() > deadline) break;
              await sleepMs(100);
            }
          }
          pendingDirection = null;
          continue;
        }
      }

      // 应用待处理的方向移动
      if (pendingDirection) {
        const s = await snapshotReal(page);
        if (!s.eventRunning && !s.messageBusy) {
          const [dx, dy] = pendingDirection;
          await page.evaluate(
            (pos: { x: number; y: number }) => (window as unknown as RecorderWindow).__rmtestReal.setPlayer(pos.x, pos.y),
            { x: s.playerX + dx, y: s.playerY + dy },
          );
          pendingSteps++;
        }
        pendingDirection = null;
      }
    }
  };

  const polling = poll();

  return {
    stop: async () => {
      await page.evaluate(() => {
        (window as unknown as RecorderWindow).__rmtestRecorder.events.push("Escape");
      });
      await polling;
      const s = await snapshotReal(page);
      // 末尾未落地的移动补一个 walk 到当前位置
      const last = steps[steps.length - 1];
      const moved = s.playerX !== start.playerX || s.playerY !== start.playerY;
      const lastWalkToCurrent = last?.type === "walk" && last.to.x === s.playerX && last.to.y === s.playerY;
      if (moved && !lastWalkToCurrent) {
        steps.push({ type: "walk", to: { map: s.mapId, x: s.playerX, y: s.playerY } });
      }
      return ScenarioSchema.parse({ id: opts.scenarioId ?? "recorded", steps });
    },
  };
}
