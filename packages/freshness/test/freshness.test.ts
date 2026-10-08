import { describe, expect, it } from "vitest";
import { IR_SCHEMA_VERSION, universeFromIR, type IRDocument } from "@rmtest/core";
import type { Scenario } from "@rmtest/dsl";
import { classifyScenario, maintenanceReport } from "../src/freshness.ts";

function ir(): IRDocument {
  return {
    schemaVersion: IR_SCHEMA_VERSION,
    engine: "mv",
    system: {
      title: "T",
      switches: ["", "S1", "S2"],
      variables: ["", "V1"],
      startMapId: 1,
      startX: 2,
      startY: 2,
      title1Name: "",
      title2Name: "",
      sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
      vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
    },
    maps: [
      { id: 1, name: "M1", width: 5, height: 4, tilesetId: 1, data: [], parallaxName: "", bgmName: "", bgsName: "", battleback1Name: "", battleback2Name: "", encounterTroopIds: [], events: [] },
      { id: 2, name: "M2", width: 5, height: 4, tilesetId: 1, data: [], parallaxName: "", bgmName: "", bgsName: "", battleback1Name: "", battleback2Name: "", encounterTroopIds: [], events: [] },
    ],
    actors: [],
    commonEvents: [],
    tilesets: [],
    items: [],
    weapons: [],
    armors: [],
    skills: [],
    troops: [],
    enemies: [],
    animations: [],
    classes: [],
  };
}

const FP = "abc123";

function scenario(steps: Scenario["steps"], fingerprint?: string): Scenario {
  return { id: "s1", game_fingerprint: fingerprint, steps };
}

describe("时效性三分类", () => {
  it("指纹一致 → fresh", () => {
    const s = scenario([{ type: "start_new_game" }, { type: "assert_map", map: 2 }], FP);
    expect(classifyScenario(s, ir(), universeFromIR(ir()), FP).status).toBe("fresh");
  });

  it("指纹不同 → stale", () => {
    const s = scenario([{ type: "start_new_game" }, { type: "assert_map", map: 2 }], FP);
    expect(classifyScenario(s, ir(), universeFromIR(ir()), "def456").status).toBe("stale");
  });

  it("引用失效 → broken（优先于 stale）", () => {
    const s = scenario(
      [
        { type: "start_new_game" },
        { type: "assert_switch", switchId: 99, value: true }, // 不存在
      ],
      FP,
    );
    const result = classifyScenario(s, ir(), universeFromIR(ir()), "def456"); // 指纹也不同
    expect(result.status).toBe("broken");
    expect(result.issues[0]).toContain("开关 99");
  });

  it("无指纹记录 → 引用有效即 fresh（历史场景）", () => {
    const s = scenario([{ type: "start_new_game" }]);
    expect(classifyScenario(s, ir(), universeFromIR(ir()), "def456").status).toBe("fresh");
  });

  it("维护报告聚合语料库", () => {
    const corpus = [
      scenario([{ type: "start_new_game" }], FP), // fresh
      scenario([{ type: "assert_map", map: 2 }], FP), // fresh
      scenario([{ type: "assert_map", map: 2 }], "old"), // stale
      scenario([{ type: "assert_switch", switchId: 9, value: true }]), // broken
    ];
    const report = maintenanceReport(corpus, ir(), universeFromIR(ir()), FP);
    expect(report).toMatchObject({ fresh: 2, stale: 1, broken: 1 });
  });
});
