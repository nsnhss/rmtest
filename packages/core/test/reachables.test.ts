import { describe, expect, it } from "vitest";
import { Cmd, IR_SCHEMA_VERSION, type IRCommand, type IRDocument } from "../src/ir.ts";
import { diffContentKeys, reachablePageKeys } from "../src/facts/reachables.ts";

function map(id: number, events: Array<{ eventId: number; commands: IRCommand[] }>): IRDocument["maps"][number] {
  return {
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
    events: events.map((e) => ({
      id: e.eventId,
      name: `E${e.eventId}`,
      x: 1,
      y: 1,
      pages: [
        {
          index: 0,
          conditions: { selfSwitchCh: null, switch1Id: null, switch2Id: null, variableId: null, variableValue: 0, actorId: null, itemId: null },
          trigger: 0,
          commands: e.commands,
        },
      ],
    })),
  };
}

function ir(maps: IRDocument["maps"]): IRDocument {
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
    maps,
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

const transfer = (mapId: number): IRCommand => ({ code: Cmd.TransferPlayer, indent: 0, parameters: [0, mapId, 1, 1, 0, 0] });

describe("可达事件页全集", () => {
  it("只含从开局沿传送可达的地图", () => {
    const doc = ir([
      map(1, [{ eventId: 1, commands: [transfer(2)] }, { eventId: 2, commands: [] }]),
      map(2, [{ eventId: 1, commands: [] }]),
      map(3, [{ eventId: 1, commands: [] }]), // 无任何传送指向 → 不可达
    ]);
    expect(reachablePageKeys(doc)).toEqual(["1:1:0", "1:2:0", "2:1:0"]);
  });

  it("传送被移除 → 目标地图退出可达集", () => {
    const doc = ir([
      map(1, [{ eventId: 1, commands: [] }]),
      map(2, [{ eventId: 1, commands: [] }]),
    ]);
    expect(reachablePageKeys(doc)).toEqual(["1:1:0"]);
  });
});

describe("内容 diff", () => {
  it("新增与删除分开报", () => {
    const diff = diffContentKeys(["1:1:0", "1:2:0", "2:1:0"], ["1:1:0", "2:1:0", "3:1:0"]);
    expect(diff.added).toEqual(["3:1:0"]);
    expect(diff.removed).toEqual(["1:2:0"]);
  });

  it("无变化 → 空 diff", () => {
    expect(diffContentKeys(["a", "b"], ["b", "a"])).toEqual({ added: [], removed: [] });
  });
});
