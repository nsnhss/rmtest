import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeScenario, solveReach } from "../src/index.ts";
import type { ElectronFixture } from "./electron-fixture.ts";
import { launchFixture } from "./electron-fixture.ts";

let fx: ElectronFixture;

beforeAll(async () => {
  fx = await launchFixture();
}, 60_000);

afterAll(async () => {
  await fx.close();
});

describe("求解器补测", () => {
  it("为未覆盖事件页合成可达场景", async () => {
    // 目标：事件页 1:2:2:0（stub 世界唯一的可交互事件）
    const result = await solveReach(fx.page, ["1:2:2:0"]);
    expect(result.found).toBe(true);
    expect(result.statesExplored).toBeGreaterThan(0);

    // 合成的场景开头必须是开局重置
    expect(result.scenario.steps[0]).toEqual({ type: "start_new_game" });
    // 场景执行后应真实命中目标
    await executeScenario(fx.page, result.scenario);
  });

  it("不存在的目标 → 探索预算内未找到", async () => {
    const result = await solveReach(fx.page, ["99:99:99:0"], { maxStates: 100, maxDepth: 5 });
    expect(result.found).toBe(false);
    expect(result.statesExplored).toBeLessThanOrEqual(100);
  });
});
