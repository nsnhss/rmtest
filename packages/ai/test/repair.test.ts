import { describe, expect, it } from "vitest";
import { IR_SCHEMA_VERSION, universeFromIR, type IRDocument } from "@rmtest/core";
import type { Scenario } from "@rmtest/dsl";
import { MockProvider } from "../src/provider.ts";
import { buildGameSurface } from "../src/surface.ts";
import { repairScenario } from "../src/repair.ts";

function ir(): IRDocument {
  return {
    schemaVersion: IR_SCHEMA_VERSION,
    engine: "mv",
    system: {
      title: "T",
      switches: ["", "任务开关"],
      variables: ["", "计数"],
      startMapId: 1,
      startX: 2,
      startY: 2,
      title1Name: "",
      title2Name: "",
      sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
      vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
    },
    maps: [
      { id: 1, name: "起始镇", width: 5, height: 4, tilesetId: 1, data: [], parallaxName: "", bgmName: "", bgsName: "", battleback1Name: "", battleback2Name: "", encounterTroopIds: [], events: [] },
      { id: 2, name: "野外", width: 5, height: 4, tilesetId: 1, data: [], parallaxName: "", bgmName: "", bgsName: "", battleback1Name: "", battleback2Name: "", encounterTroopIds: [], events: [] },
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

const doc = ir();
const universe = universeFromIR(doc);
const surface = buildGameSurface(doc);

describe("stale 修复提案", () => {
  it("旧场景引用失效 → AI 提案过闸门 → 更新版引用有效", async () => {
    const stale: Scenario = {
      id: "quest",
      steps: [
        { type: "start_new_game" },
        { type: "walk", to: { map: 9, x: 1, y: 1 } }, // 地图 9 已不存在
      ],
    };
    const repaired = JSON.stringify({
      id: "quest",
      steps: [
        { type: "start_new_game" },
        { type: "walk", to: { map: 2, x: 1, y: 1 } },
      ],
    });
    const result = await repairScenario(stale, surface, doc, universe, new MockProvider([repaired]));
    expect(result.error).toBeNull();
    expect(result.scenario!.steps[1]).toMatchObject({ type: "walk", to: { map: 2 } });
  });

  it("提案仍引用失效实体 → 打回并记录反馈", async () => {
    const stale: Scenario = {
      id: "quest",
      steps: [{ type: "start_new_game" }, { type: "walk", to: { map: 9, x: 1, y: 1 } }],
    };
    const bad = JSON.stringify({
      id: "quest",
      steps: [{ type: "start_new_game" }, { type: "walk", to: { map: 9, x: 1, y: 1 } }],
    });
    const result = await repairScenario(stale, surface, doc, universe, new MockProvider([bad]));
    expect(result.scenario).toBeNull();
    expect(result.feedback[0]).toContain("地图 9");
  });
});
