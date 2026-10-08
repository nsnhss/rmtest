import { describe, expect, it } from "vitest";
import { IR_SCHEMA_VERSION, type IRDocument } from "@rmtest/core";
import type { Scenario } from "@rmtest/dsl";
import { relinkScenario } from "../src/relink.ts";

function ir(mapIds: number[]): IRDocument {
  return {
    schemaVersion: IR_SCHEMA_VERSION,
    engine: "mv",
    system: {
      title: "T",
      switches: ["", "S1"],
      variables: ["", "V1"],
      startMapId: 1,
      startX: 2,
      startY: 2,
      title1Name: "",
      title2Name: "",
      sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
      vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
    },
    maps: mapIds.map((id) => ({
      id,
      name: `M${id}`,
      width: 5,
      height: 4,
      tilesetId: 1,
      data: [],
      parallaxName: "",
      bgmName: "",
      bgsName: "",
      battleback1Name: "",
      battleback2Name: "",
      encounterTroopIds: [],
      events: [],
    })),
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

function scenario(): Scenario {
  return {
    id: "s1",
    game_fingerprint: "old",
    bindings: [{ kind: "map", id: 9, hash: "h2" }],
    steps: [
      { type: "start_new_game" },
      { type: "walk", to: { map: 9, x: 1, y: 1 } },
    ],
  };
}

describe("机械重链", () => {
  it("唯一哈希命中 → 迁移地图绑定", () => {
    const out = relinkScenario(
      scenario(),
      ir([1, 2]),
      new Map([
        ["data/Map001.json", "h1"],
        ["data/Map002.json", "h2"],
      ]),
    );
    expect(out.relinked).toEqual([{ kind: "map", fromId: 9, toId: 2 }]);
    expect(out.scenario.steps[1]).toMatchObject({ type: "walk", to: { map: 2 } });
    expect(out.scenario.bindings![0]).toMatchObject({ kind: "map", id: 2 });
    expect(out.unresolved).toEqual([]);
  });

  it("多个哈希命中 → 不重链并说明", () => {
    const out = relinkScenario(
      scenario(),
      ir([1, 2, 3]),
      new Map([
        ["data/Map001.json", "h1"],
        ["data/Map002.json", "h2"],
        ["data/Map003.json", "h2"],
      ]),
    );
    expect(out.relinked).toEqual([]);
    expect(out.unresolved).toHaveLength(1);
    expect(out.unresolved[0]).toContain("2 个候选");
  });

  it("无绑定哈希 → 不重链", () => {
    const s = scenario();
    s.bindings = undefined;
    const out = relinkScenario(s, ir([1]), new Map([["data/Map001.json", "h1"]]));
    expect(out.relinked).toEqual([]);
    expect(out.unresolved[0]).toContain("无绑定哈希");
  });

  it("合法引用不受影响", () => {
    const s = scenario();
    s.steps = [{ type: "start_new_game" }, { type: "walk", to: { map: 1, x: 1, y: 1 } }];
    const out = relinkScenario(s, ir([1]), new Map());
    expect(out.relinked).toEqual([]);
    expect(out.unresolved).toEqual([]);
  });
});
