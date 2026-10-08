import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Scenario } from "@rmtest/dsl";
import { executeScenario } from "../src/index.ts";
import type { ElectronFixture } from "./electron-fixture.ts";
import { launchFixture } from "./electron-fixture.ts";

let fx: ElectronFixture;

beforeAll(async () => {
  fx = await launchFixture();
}, 60_000);

afterAll(async () => {
  await fx.close();
});

describe("场景执行器（stub 运行时）", () => {
  it("完整通过：开局 → 交互 → 断言开关与传送", async () => {
    const scenario: Scenario = {
      id: "pass-1",
      steps: [
        { type: "start_new_game" },
        { type: "interact", direction: "up" },
        { type: "assert_switch", switchId: 1, value: true },
        { type: "assert_map", map: 2 },
      ],
    };
    const result = await executeScenario(fx.page, scenario);
    expect(result.passed).toBe(true);
    expect(result.stepResults.map((r) => r.passed)).toEqual([true, true, true, true]);
    expect(result.finalSnapshot.transfer).toMatchObject({ mapId: 2, x: 2, y: 2 });
  });

  it("断言失败：开关不符 → 失败即停并给出实际值", async () => {
    const scenario: Scenario = {
      id: "fail-1",
      steps: [
        { type: "start_new_game" },
        { type: "assert_switch", switchId: 2, value: true },
        { type: "assert_switch", switchId: 1, value: true }, // 不应执行
      ],
    };
    const result = await executeScenario(fx.page, scenario);
    expect(result.passed).toBe(false);
    expect(result.stepResults).toHaveLength(2); // 失败即停
    expect(result.stepResults[1]!.message).toContain("开关 2");
    expect(result.stepResults[1]!.message).toContain("实际 false");
  });

  it("断言失败：地图不符", async () => {
    const scenario: Scenario = {
      id: "fail-2",
      steps: [
        { type: "start_new_game" },
        { type: "assert_map", map: 5 },
      ],
    };
    const result = await executeScenario(fx.page, scenario);
    expect(result.passed).toBe(false);
    expect(result.stepResults[1]!.message).toContain("地图期望 5");
  });

  it("分支语义：开关 1 ON 后走真支（开关 2 置位）", async () => {
    const scenario: Scenario = {
      id: "branch-1",
      steps: [
        { type: "start_new_game" },
        { type: "interact", direction: "up" },
        { type: "assert_switch", switchId: 2, value: true },
      ],
    };
    const result = await executeScenario(fx.page, scenario);
    expect(result.passed).toBe(true);
  });
});
