import { describe, expect, it } from "vitest";
import type { Scenario } from "@rmtest/dsl";
import { ProjectStore } from "../src/store.ts";

function scenario(id: string): Scenario {
  return {
    id,
    game_fingerprint: "fp1",
    steps: [
      { type: "start_new_game" },
      { type: "assert_map", map: 1 },
    ],
  };
}

describe("项目库", () => {
  it("场景增改查删", () => {
    const store = new ProjectStore(":memory:");
    store.upsertScenario(scenario("a"));
    store.upsertScenario({ ...scenario("b"), game_fingerprint: "fp2" });

    expect(store.listScenarios()).toHaveLength(2);
    expect(store.getScenario("a")!.game_fingerprint).toBe("fp1");

    store.upsertScenario({ ...scenario("a"), game_fingerprint: "fp3" }); // 更新
    expect(store.listScenarios()).toHaveLength(2);
    expect(store.getScenario("a")!.game_fingerprint).toBe("fp3");

    store.deleteScenario("b");
    expect(store.listScenarios()).toHaveLength(1);
    expect(store.getScenario("b")).toBeNull();
    store.close();
  });

  it("运行结果记录与查询", () => {
    const store = new ProjectStore(":memory:");
    const id1 = store.recordResult({ scenarioId: "a", passed: true, stepResultsJson: "[]", snapshotJson: "{}" });
    const id2 = store.recordResult({ scenarioId: "a", passed: false, stepResultsJson: "[]", snapshotJson: "{}" });
    const results = store.listResults("a");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual([id1, id2].sort());
    expect(results.find((r) => r.id === id2)!.passed).toBe(false);
    store.close();
  });

  it("golden 基线存取", () => {
    const store = new ProjectStore(":memory:");
    store.saveBaseline({ tag: "menu", png: "aGVsbG8=", width: 800, height: 600 });
    store.saveBaseline({ tag: "menu", png: "d29ybGQ=", width: 800, height: 600 }); // 更新
    const b = store.getBaseline("menu")!;
    expect(b.png).toBe("d29ybGQ=");
    expect(store.getBaseline("battle")).toBeNull();
    expect(store.listBaselines()).toHaveLength(1);
    store.close();
  });

  it("游戏指纹存取", () => {
    const store = new ProjectStore(":memory:");
    expect(store.getGameFingerprint()).toBeNull();
    store.setGameFingerprint("abc");
    expect(store.getGameFingerprint()).toBe("abc");
    store.close();
  });
});
