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
import type { GameHandle } from "./realengine.ts";
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

export async function startRecording(handle: GameHandle, opts: RecorderOptions = {}): Promise<RecordingHandle> {
  await handle.evaluate(RECORDER_SCRIPT);
  await handle.evaluate(() => {
    (window as unknown as RecorderWindow).__rmtestRecorder.events.length = 0;
  });

  // 录制从当前状态开始：场景第一帧记录当前位置
  const start = await snapshotReal(handle);
  const steps: ScenarioStep[] = [{ type: "start_new_game" }];
  let pendingSteps = 0;

  const poll = async (): Promise<void> => {
    for (;;) {
      await sleepMs(50);
      const keys = (await handle.evaluate(() => {
        const w = window as unknown as RecorderWindow;
        const ev = w.__rmtestRecorder.events.splice(0);
        return ev;
      })) as string[];

      for (const key of keys) {
        if (key === "Escape") return; // 停止
        const dir = DIRECTION_KEYS[key];
        if (dir) {
          // 逐键立即应用（批量只留最后一个会丢移动；连续移动在 Enter 时合并成一个 walk）
          const s = await snapshotReal(handle);
          if (!s.eventRunning && !s.messageBusy && !s.choiceActive) {
            await handle.evaluate(
              (pos: { x: number; y: number }) => (window as unknown as RecorderWindow).__rmtestReal.setPlayer(pos.x, pos.y),
              { x: s.playerX + dir[0], y: s.playerY + dir[1] },
            );
            pendingSteps++;
          }
          continue;
        }
        if (key === "Enter" || key === " ") {
          // 冲掉未消费的移动（方向已被应用消费，只看累计步数）
          if (pendingSteps > 0) {
            const s = await snapshotReal(handle);
            steps.push({ type: "walk", to: { map: s.mapId, x: s.playerX, y: s.playerY } });
            pendingSteps = 0;
          }
          const s = await snapshotReal(handle);
          if (s.messageBusy || s.choiceActive) {
            await pressOk(handle); // 消息确认 / 确认当前选项
          } else {
            steps.push({ type: "interact", direction: "up" });
            await triggerAt(handle, s.playerX, s.playerY);
            // 事件带消息时自动确认到结束
            const deadline = Date.now() + 20_000;
            for (;;) {
              const t = await snapshotReal(handle);
              if (!t.eventRunning && !t.messageBusy && !t.choiceActive) break;
              if (t.messageBusy) await pressOk(handle);
              if (t.choiceActive) break; // 选项留给后续按键
              if (Date.now() > deadline) break;
              await sleepMs(100);
            }
          }
          continue;
        }
      }
    }
  };

  const polling = poll();

  return {
    stop: async () => {
      await handle.evaluate(() => {
        (window as unknown as RecorderWindow).__rmtestRecorder.events.push("Escape");
      });
      await polling;
      const s = await snapshotReal(handle);
      // 末尾未落地的移动补一个 walk 到当前位置（已记录过的位置不重复补）
      const moved = s.playerX !== start.playerX || s.playerY !== start.playerY;
      const alreadyRecorded = steps.some(
        (st) => st.type === "walk" && st.to.x === s.playerX && st.to.y === s.playerY,
      );
      if (moved && !alreadyRecorded) {
        steps.push({ type: "walk", to: { map: s.mapId, x: s.playerX, y: s.playerY } });
      }
      return ScenarioSchema.parse({ id: opts.scenarioId ?? "recorded", steps });
    },
  };
}
