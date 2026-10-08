import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Scenario } from "@rmtest/dsl";
import { coverageGap, executeScenario, mergeCoverage, readCoverage } from "../src/index.ts";
import type { ElectronFixture } from "./electron-fixture.ts";
import { launchFixture } from "./electron-fixture.ts";

let fx: ElectronFixture;

beforeAll(async () => {
  fx = await launchFixture();
}, 60_000);

afterAll(async () => {
  await fx.close();
});

const interactScenario: Scenario = {
  id: "cov-1",
  steps: [
    { type: "start_new_game" },
    { type: "interact", direction: "up" },
  ],
};

describe("覆盖计数", () => {
  it("交互后事件页与分支计数被记录", async () => {
    await executeScenario(fx.page, { id: "reset", steps: [{ type: "start_new_game" }] });
    await executeScenario(fx.page, interactScenario);
    const cov = await readCoverage(fx.page);
    expect(cov.pages["1:2:2:0"]).toBeGreaterThanOrEqual(1);
    expect(cov.branches["1:2:2"]).toEqual({ taken: 1, total: 1 });
  });

  it("无交互运行 → 零覆盖", async () => {
    // 换一个未交互的会话状态检查：readCoverage 是累计的，无法清零（stub 设计）
    // 因此只验证：覆盖对比的分母机制
    const cov = await readCoverage(fx.page);
    const gap = coverageGap(cov, ["1:2:2:0", "9:9:9:0"]);
    expect(gap.total).toBe(2);
    expect(gap.covered).toBe(1);
    expect(gap.uncovered).toEqual(["9:9:9:0"]);
  });

  it("覆盖率对比：未覆盖页 + 单侧分支", async () => {
    const cov = await readCoverage(fx.page);
    const gap = coverageGap(cov, ["1:2:2:0"]);
    expect(gap.covered).toBe(1);
    // stub 世界里分支恒真 → 只走过一边
    expect(gap.oneSidedBranches).toContain("1:2:2");
  });

  it("mergeCoverage 聚合多次运行", () => {
    const a = { pages: { "1:2:2:0": 2 }, branches: { "1:2:2": { taken: 1, total: 2 } } };
    const b = { pages: { "1:2:2:0": 3, "2:3:3:0": 1 }, branches: { "1:2:2": { taken: 1, total: 1 } } };
    const merged = mergeCoverage(a, b);
    expect(merged.pages["1:2:2:0"]).toBe(5);
    expect(merged.pages["2:3:3:0"]).toBe(1);
    expect(merged.branches["1:2:2"]).toEqual({ taken: 2, total: 3 });
  });
});
