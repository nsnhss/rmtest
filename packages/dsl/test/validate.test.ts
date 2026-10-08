import { describe, expect, it } from "vitest";
import { IR_SCHEMA_VERSION, universeFromIR, type IRDocument } from "@rmtest/core";
import { StepSchema, type Scenario } from "../src/scenario.ts";
import { validateScenario } from "../src/validate.ts";

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

function scenario(steps: Scenario["steps"]): Scenario {
  return { id: "t1", steps };
}

describe("场景 DSL", () => {
  it("schema 拒绝未知步骤类型", () => {
    const result = StepSchema.safeParse({ type: "fly" });
    expect(result.success).toBe(false);
  });

  it("schema 拒绝负坐标", () => {
    const result = StepSchema.safeParse({ type: "walk", to: { map: 1, x: -1, y: 0 } });
    expect(result.success).toBe(false);
  });

  it("合法场景 → 校验通过", () => {
    const s = scenario([
      { type: "start_new_game" },
      { type: "walk", to: { map: 1, x: 2, y: 2 } },
      { type: "interact", direction: "up" },
      { type: "assert_switch", switchId: 1, value: true },
      { type: "assert_map", map: 2 },
    ]);
    expect(validateScenario(s, ir(), universeFromIR(ir()))).toEqual({ ok: true, issues: [] });
  });

  it("不存在的开关/地图/越界坐标 → 逐条报错", () => {
    const s = scenario([
      { type: "walk", to: { map: 9, x: 0, y: 0 } },
      { type: "walk", to: { map: 1, x: 9, y: 0 } },
      { type: "assert_switch", switchId: 99, value: true },
      { type: "assert_map", map: 7 },
    ]);
    const result = validateScenario(s, ir(), universeFromIR(ir()));
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.message)).toEqual([
      "第 1 步引用的地图 9 不存在",
      "第 2 步坐标 (9, 0) 超出地图 1（5×4）",
      "第 3 步引用的开关 99 不存在",
      "第 4 步引用的地图 7 不存在",
    ]);
  });
});
