import { describe, expect, it } from "vitest";
import { buildLifecycle } from "../src/facts/lifecycle.ts";
import { Cmd, type IRCommand, type IRDocument, IR_SCHEMA_VERSION } from "../src/ir.ts";

function irWith(commands: IRCommand[], systemOverrides?: Partial<IRDocument["system"]>): IRDocument {
  return {
    schemaVersion: IR_SCHEMA_VERSION,
    engine: "mv",
    system: {
      title: "T",
      switches: ["", "S1", "S2"],
      variables: ["", "V1"],
      startMapId: 1,
      startX: 1,
      startY: 1,
      title1Name: "",
      title2Name: "",
      sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
      vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
      ...systemOverrides,
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
                conditions: { selfSwitchCh: null, switch1Id: 1, switch2Id: null, variableId: null, variableValue: 0, actorId: null, itemId: null },
                trigger: 0,
                commands,
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

describe("生命周期 facts", () => {
  it("收集开关/变量/独立开关的读写点", () => {
    const ir = irWith([
      { code: Cmd.ControlSwitches, indent: 0, parameters: [2, 2, 0] },
      { code: Cmd.ConditionalBranch, indent: 0, parameters: [0, 1] },
      { code: Cmd.ControlSelfSwitch, indent: 1, parameters: ["A", 0] },
      { code: Cmd.ControlVariables, indent: 1, parameters: [1, 1, 0] },
      { code: Cmd.ConditionalBranch, indent: 0, parameters: [1, 1, 5, 0] },
    ]);

    const life = buildLifecycle(ir);

    expect(life.switches.get(1)!.reads).toHaveLength(2); // 页条件 + 分支
    expect(life.switches.get(1)!.writes).toEqual([]);
    expect(life.switches.get(2)!.writes).toHaveLength(1);
    expect(life.switches.get(2)!.reads).toEqual([]);
    expect(life.variables.get(1)!.writes).toHaveLength(1);
    expect(life.variables.get(1)!.reads).toHaveLength(1);
    expect(life.selfSwitches.get("1:1:A")!.writes).toHaveLength(1);
  });

  it("写入点带命令位置", () => {
    const ir = irWith([{ code: Cmd.ControlSwitches, indent: 0, parameters: [2, 2, 0] }]);
    const life = buildLifecycle(ir);
    expect(life.switches.get(2)!.writes[0]).toMatchObject({ mapId: 1, eventId: 1, pageIndex: 0, commandIndex: 0 });
  });

  it("公共事件：parallel 触发开关是读取，命令照常收集", () => {
    const ir = irWith([]);
    ir.commonEvents = [
      { id: 1, name: "CE", trigger: 2, switchId: 1, commands: [{ code: Cmd.ControlSwitches, indent: 0, parameters: [2, 2, 0] }] },
    ];
    const life = buildLifecycle(ir);
    expect(life.switches.get(1)!.reads).toHaveLength(2); // 页条件 + 触发条件
    expect(life.switches.get(2)!.writes).toHaveLength(1); // 命令
  });
});
