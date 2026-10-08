import { describe, expect, it } from "vitest";
import { Cmd, type IRCommand, type IRDocument, IR_SCHEMA_VERSION } from "../src/ir.ts";
import { switchHashes, switchWriteSignature } from "../src/facts/entity-hashes.ts";

function ir(writeCmd: IRCommand): IRDocument {
  return {
    schemaVersion: IR_SCHEMA_VERSION,
    engine: "mv",
    system: {
      title: "T",
      switches: ["", "任务开关"],
      variables: ["", "V"],
      startMapId: 1,
      startX: 2,
      startY: 2,
      title1Name: "",
      title2Name: "",
      sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
      vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
    },
    maps: [
      {
        id: 1,
        name: "M1",
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
            name: "E1",
            x: 1,
            y: 1,
            pages: [
              {
                index: 0,
                conditions: { selfSwitchCh: null, switch1Id: null, switch2Id: null, variableId: null, variableValue: 0, actorId: null, itemId: null },
                trigger: 0,
                commands: [writeCmd],
              },
            ],
          },
        ],
      },
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

describe("实体内容哈希（写入签名）", () => {
  it("开关 1 有写入 → 有签名；未写入 → null", () => {
    const doc = ir({ code: Cmd.ControlSwitches, indent: 0, parameters: [1, 1, 0] });
    expect(switchWriteSignature(doc, 1)).not.toBeNull();
    expect(switchWriteSignature(doc, 2)).toBeNull();
    expect(switchHashes(doc).has(1)).toBe(true);
  });

  it("写入内容变化 → 签名变化（重链匹配依据）", () => {
    const a = switchWriteSignature(ir({ code: Cmd.ControlSwitches, indent: 0, parameters: [1, 1, 0] }), 1)!;
    const b = switchWriteSignature(ir({ code: Cmd.ControlSwitches, indent: 0, parameters: [2, 2, 0] }), 1);
    expect(b).toBeNull(); // 写的是开关 2，开关 1 无签名
    const c = switchWriteSignature(ir({ code: Cmd.ControlSwitches, indent: 0, parameters: [1, 1, 1] }), 1)!;
    expect(c).not.toBe(a); // 写的是 ON vs OFF → 签名不同
  });
});
