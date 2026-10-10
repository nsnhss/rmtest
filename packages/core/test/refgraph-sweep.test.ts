/**
 * refgraph 全命令扫描 —— 所有已识别的 MV 命令码逐一投喂：
 * 每个分支形态（mode 0/1/2、数组商品、移动路线）都不崩溃，且引用语义正确。
 */
import { describe, expect, it } from "vitest";
import { buildRefGraph, Cmd, type IRDocument } from "@rmtest/core";

function sweepIr(commands: Array<{ code: number; parameters: unknown[]; indent?: number }>): IRDocument {
  const ir: IRDocument = {
    schemaVersion: 5,
    engine: "mv",
    system: {
      title: "sweep",
      switches: ["S1", "S2"],
      variables: ["V1", "V2"],
      startMapId: 1,
      startX: 0,
      startY: 0,
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
        height: 5,
        tilesetId: 1,
        data: new Array(25).fill(10),
        parallaxName: "",
        bgmName: "",
        bgsName: "",
        battleback1Name: "",
        battleback2Name: "",
        encounterTroopIds: [],
        events: [
          {
            id: 1,
            name: "EV1",
            x: 0,
            y: 0,
            pages: [
              {
                index: 0,
                conditions: { selfSwitchCh: null, switch1Id: null, switch2Id: null, variableId: null, variableValue: 0, actorId: null, itemId: null },
                trigger: 0,
                commands: commands.map((c) => ({ code: c.code, parameters: c.parameters, indent: c.indent ?? 0 })),
              },
            ],
          },
        ],
      },
    ],
    actors: [{ id: 1, name: "Actor1", classId: 1, faceName: "", faceIndex: 0, characterName: "", characterIndex: 0 }],
    commonEvents: [{ id: 1, name: "CE1", trigger: 0, switchId: null, commands: [] }],
    tilesets: [{ id: 1, name: "T", imageNames: [], flags: [] }],
    items: [{ id: 1, name: "I1", iconIndex: 0 }],
    weapons: [{ id: 1, name: "W1", iconIndex: 0 }],
    armors: [{ id: 1, name: "A1", iconIndex: 0 }],
    skills: [{ id: 1, name: "SK1", iconIndex: 0 }],
    troops: [{ id: 1, name: "T1", enemyIds: [] }],
    enemies: [{ id: 1, name: "E1", battlerName: "" }],
    animations: [{ id: 1, name: "AN1", image1Name: "", image2Name: "" }],
    classes: [{ id: 1, name: "C1" }],
  };
  return ir;
}

describe("refgraph 全命令扫描", () => {
  it("每个命令码都不崩溃", () => {
    const allCodes = Object.values(Cmd as Record<string, number>);
    const commands = allCodes.map((code) => ({ code, parameters: ["1", "1", "1", "1", "1", "1", "1", "1"] }));
    const graph = buildRefGraph(sweepIr(commands));
    expect(graph.refs.length).toBeGreaterThan(0); // 至少文本/资源类产生引用
  });

  it("条件分支四种模式", () => {
    const graph = buildRefGraph(sweepIr([
      { code: Cmd.ConditionalBranch, parameters: [0, 2] }, // switch 2
      { code: Cmd.ConditionalBranch, parameters: [1, 2] }, // variable 2
      { code: Cmd.ConditionalBranch, parameters: [4, 1] }, // actor 1
      { code: Cmd.ConditionalBranch, parameters: [2, 1] }, // 其他模式无引用
    ]));
    const cats = graph.refs.map((r) => `${r.category}:${r.target}`);
    expect(cats).toContain("switch:2");
    expect(cats).toContain("variable:2");
    expect(cats).toContain("actor:1");
  });

  it("传送三种模式（直接/变量/双变量）", () => {
    const graph = buildRefGraph(sweepIr([
      { code: Cmd.TransferPlayer, parameters: [0, 3, 1, 1, 2, 0] },
      { code: Cmd.TransferPlayer, parameters: [1, 2, 1, 1, 2, 0] },
      { code: Cmd.TransferPlayer, parameters: [2, 1, 2, 1, 2, 0] },
    ]));
    const cats = graph.refs.map((r) => `${r.category}:${r.target}`);
    expect(cats).toContain("map:3");
    expect(cats).toContain("variable:2");
  });

  it("商店商品三种类型 + 战斗处理两种模式", () => {
    const graph = buildRefGraph(sweepIr([
      { code: Cmd.ShopProcessing, parameters: [[[0, 5], [1, 6], [2, 7]], true] },
      { code: Cmd.BattleProcessing, parameters: [0, 4, false, false] },
      { code: Cmd.BattleProcessing, parameters: [1, 2, false, false] },
    ]));
    const cats = graph.refs.map((r) => `${r.category}:${r.target}`);
    expect(cats).toContain("item:5");
    expect(cats).toContain("weapon:6");
    expect(cats).toContain("armor:7");
    expect(cats).toContain("troop:4");
    expect(cats).toContain("variable:2");
  });

  it("移动路线中的换装步骤提取行走图引用", () => {
    const graph = buildRefGraph(sweepIr([
      {
        code: Cmd.SetMoveRoute,
        parameters: [{ list: [{ code: 41, parameters: ["Actor1", 0] }, { code: 0, parameters: [] }], repeat: false, skippable: false, wait: false }],
      },
    ]));
    expect(graph.refs.some((r) => r.category === "asset" && r.target.includes("Actor1"))).toBe(true);
  });

  it("开关/变量批量控制：区间展开", () => {
    const graph = buildRefGraph(sweepIr([
      { code: Cmd.ControlSwitches, parameters: [1, 3, 0] },
      { code: Cmd.ControlVariables, parameters: [1, 2, 0, 0, 1] },
    ]));
    const cats = graph.refs.map((r) => `${r.category}:${r.target}`);
    expect(cats).toContain("switch:1");
    expect(cats).toContain("switch:3");
    expect(cats).toContain("variable:1");
    expect(cats).toContain("variable:2");
  });
});
