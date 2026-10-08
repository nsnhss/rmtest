/**
 * 求解器补测 —— 对未覆盖目标（事件页）做状态空间 BFS，合成可达场景。
 * stub 运行时上的机制验证；真实 MV 引擎上求解器将基于地图/事件图抽象执行。
 *
 * 行动空间（stub 世界）：开局重置 + 20 格走位 + 交互。
 * 确定性：BFS 行动顺序固定；同输入同输出。
 */
import type { Page } from "puppeteer-core";
import type { Scenario } from "@rmtest/dsl";
import { readCoverage } from "./coverage.ts";

export interface SolveOptions {
  /** 探索状态数上限（防御性预算） */
  maxStates?: number;
  /** 路径深度上限 */
  maxDepth?: number;
}

export interface SolveResult {
  found: boolean;
  scenario: Scenario;
  statesExplored: number;
}

// 页面契约：stub 世界表面
interface GamePage {
  startNewGame: () => void;
  walk: (x: number, y: number) => void;
  interact: () => void;
  snapshot: () => { mapId: number; x: number; y: number; switches: Record<string, boolean> };
  counters: () => { pages: Record<string, number> };
}
interface GameWindow {
  __game: GamePage;
}

type Action = { kind: "start" } | { kind: "walk"; x: number; y: number } | { kind: "interact" };

function allActions(): Action[] {
  const actions: Action[] = [];
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 4; y++) actions.push({ kind: "walk", x, y });
  }
  actions.push({ kind: "interact" });
  return actions;
}

function actionStep(a: Action): Scenario["steps"][number] {
  switch (a.kind) {
    case "start":
      return { type: "start_new_game" };
    case "walk":
      return { type: "walk", to: { map: 1, x: a.x, y: a.y } };
    case "interact":
      return { type: "interact", direction: "up" };
  }
}

export async function solveReach(page: Page, targets: string[], opts: SolveOptions = {}): Promise<SolveResult> {
  const maxStates = opts.maxStates ?? 2000;
  const maxDepth = opts.maxDepth ?? 10;
  const targetSet = new Set(targets);

  const apply = async (a: Action): Promise<string> => {
    const key = (await page.evaluate((action) => {
      const game = (window as unknown as GameWindow).__game;
      if (action.kind === "start") game.startNewGame();
      else if (action.kind === "walk") game.walk(action.x, action.y);
      else game.interact();
      const s = game.snapshot();
      return `${s.mapId}:${s.x}:${s.y}`;
    }, a)) as string;
    return key;
  };

  const hitsTarget = async (): Promise<boolean> => {
    const cov = await readCoverage(page);
    return targets.some((t) => (cov.pages[t] ?? 0) > 0);
  };

  const replay = async (actions: Action[]): Promise<void> => {
    for (const a of actions) await apply(a);
  };

  // BFS：状态 = 路径行动序列；用 (深度, 行动序列) 枚举，visited 按状态 key 去重
  const visited = new Set<string>();
  const queue: Array<{ actions: Action[]; stateKey: string }> = [];
  let statesExplored = 0;

  // 初始状态
  await apply({ kind: "start" });
  queue.push({ actions: [{ kind: "start" }], stateKey: "1:2:2" });

  while (queue.length > 0 && statesExplored < maxStates) {
    const node = queue.shift()!;
    statesExplored++;
    if (node.actions.length >= maxDepth) continue;

    for (const a of allActions()) {
      await replay(node.actions);
      const key = await apply(a);
      const nextActions = [...node.actions, a];

      // 先查目标命中（interact 可能不改变状态 key，去重会漏掉命中检查）
      if (await hitsTarget()) {
        const steps = [actionStep({ kind: "start" }), ...nextActions.slice(1).map(actionStep)];
        return { found: true, scenario: { id: `solved-${targets.join("-")}`, steps }, statesExplored };
      }

      if (visited.has(key)) continue;
      visited.add(key);

      queue.push({ actions: nextActions, stateKey: key });
    }
  }

  return {
    found: false,
    scenario: { id: "unsolved", steps: [{ type: "start_new_game" }] },
    statesExplored,
  };
}
