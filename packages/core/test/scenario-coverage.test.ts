import { describe, expect, it } from "vitest";
import { Cmd, IR_SCHEMA_VERSION, type IRCommand, type IRDocument } from "../src/ir.ts";
import { scenarioMapCoverage } from "../src/facts/scenario-coverage.ts";

function ir(maps: Array<{ id: number; name: string; transfers: number[] }>): IRDocument {
  return {
    schemaVersion: IR_SCHEMA_VERSION,
    engine: "mv",
    system: {
      title: "T",
      switches: ["", "S"],
      variables: ["", "V"],
      startMapId: 1,
      startX: 2,
      startY: 2,
      title1Name: "",
      title2Name: "",
      sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
      vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
    },
    maps: maps.map((m) => ({
      id: m.id,
      name: m.name,
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
      events: [
        {
          id: 1,
          name: "E",
          x: 1,
          y: 1,
          pages: [
            {
              index: 0,
              conditions: { selfSwitchCh: null, switch1Id: null, switch2Id: null, variableId: null, variableValue: 0, actorId: null, itemId: null },
              trigger: 0,
              commands: m.transfers.map((t) => ({ code: Cmd.TransferPlayer, indent: 0, parameters: [0, t, 1, 1, 0, 0] } satisfies IRCommand)),
            },
          ],
        },
      ],
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

describe("场景覆盖（按地图）", () => {
  it("分母 = 可达地图；场景 walk/assert 的地图计入覆盖", () => {
    const doc = ir([
      { id: 1, name: "起点", transfers: [2] },
      { id: 2, name: "野外", transfers: [] },
      { id: 3, name: "孤岛", transfers: [] }, // 不可达 → 不计分母
    ]);
    const coverage = scenarioMapCoverage(doc, [
      {
        id: "s1",
        steps: [
          { type: "start_new_game" },
          { type: "walk", to: { map: 2, x: 1, y: 1 } },
          { type: "assert_map", map: 2 },
        ],
      },
    ]);
    expect(coverage.total).toBe(2);
    expect(coverage.covered).toBe(1);
    expect(coverage.maps).toEqual([
      { mapId: 1, name: "起点", covered: false },
      { mapId: 2, name: "野外", covered: true },
    ]);
  });

  it("空语料 → 全未覆盖", () => {
    const doc = ir([{ id: 1, name: "起点", transfers: [] }]);
    const coverage = scenarioMapCoverage(doc, []);
    expect(coverage.total).toBe(1);
    expect(coverage.covered).toBe(0);
  });
});
