import { describe, expect, it } from "vitest";
import { MockProvider } from "../src/provider.ts";
import { summarizeFailure, type FailureTrace } from "../src/report.ts";

const trace: FailureTrace = {
  scenarioId: "屠龙",
  stepResults: [
    { index: 0, type: "start_new_game", passed: true },
    { index: 1, type: "assert_switch", passed: false, message: "开关 12 期望 true，实际 false" },
  ],
  finalSnapshot: { mapId: 7, x: 12, y: 5, switches: { 12: false } },
};

describe("失败轨迹翻译", () => {
  it("把轨迹交给 provider 并返回 prose（判定与翻译隔离）", async () => {
    const provider = new MockProvider(["【bug】开关 12 未按预期置位。"]);
    const text = await summarizeFailure(trace, provider);
    expect(text).toContain("开关 12");
  });
});
