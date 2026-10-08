import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MockProvider } from "@rmtest/ai";
import type { Scenario } from "@rmtest/dsl";
import { repairCli } from "../src/repair.ts";

// 静态 + AI（Mock），不需要真实引擎
const FIXTURE_PROJECT = fileURLToPath(new URL("../../adapters/mv/fixtures/mini", import.meta.url));

const staleScenario: Scenario = {
  id: "stale-quest",
  game_fingerprint: "old-fp",
  steps: [
    { type: "start_new_game" },
    { type: "walk", to: { map: 2, x: 1, y: 1 } },
  ],
};

describe("CLI repair（mock AI）", () => {
  it("stale 场景 → AI 提案过闸门", async () => {
    const proposal = JSON.stringify(staleScenario);
    const outcome = await repairCli(FIXTURE_PROJECT, [staleScenario], new MockProvider([proposal]));
    expect(outcome.staleCount).toBe(1);
    expect(outcome.proposals).toHaveLength(1);
    expect(outcome.proposals[0]!.scenarioJson).not.toBeNull();
    expect(JSON.parse(outcome.proposals[0]!.scenarioJson!).steps).toHaveLength(2);
  });

  it("fresh 场景不产生提案", async () => {
    const fresh: Scenario = {
      id: "fresh-quest",
      steps: [{ type: "start_new_game" }], // 无指纹 → 引用有效即 fresh
    };
    const outcome = await repairCli(FIXTURE_PROJECT, [fresh], new MockProvider([]));
    expect(outcome.proposals).toEqual([]);
  });
});
