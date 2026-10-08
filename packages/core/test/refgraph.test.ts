import { describe, expect, it } from "vitest";
import { buildRefGraph } from "../src/facts/refgraph.ts";
import { Cmd, type IRCommand, type IRDocument, IR_SCHEMA_VERSION } from "../src/ir.ts";

function irWith(commands: IRCommand[]): IRDocument {
  return {
    schemaVersion: IR_SCHEMA_VERSION,
    engine: "mv",
    system: {
      title: "T",
      switches: ["", "任务开关"],
      variables: ["", "计数"],
      startMapId: 1,
      startX: 1,
      startY: 1,
      title1Name: "Title1",
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
        events: [{ id: 1, name: "E1", x: 1, y: 1, pages: [{ index: 0, conditions: { selfSwitchCh: null, switch1Id: null, switch2Id: null, variableId: null, variableValue: 0, actorId: null, itemId: null }, trigger: 0, commands }] }],
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

describe("引用图收集", () => {
  it("从命令树收集各域引用", () => {
    const ir = irWith([
      { code: Cmd.ConditionalBranch, indent: 0, parameters: [0, 5] },
      { code: Cmd.ControlSwitches, indent: 1, parameters: [12, 12, 0] },
      { code: Cmd.ConditionalBranch, indent: 1, parameters: [1, 3, 0, 0] },
      { code: Cmd.TransferPlayer, indent: 2, parameters: [99, 1, 1, 0, 0] },
      { code: Cmd.CallCommonEvent, indent: 0, parameters: [7] },
      { code: Cmd.ShowPicture, indent: 0, parameters: [1, "Logo", 1, 0, 0, 100, 100, 255, 0] },
      { code: Cmd.ChangeBgm, indent: 0, parameters: [{ name: "Town", volume: 90, pitch: 100, pan: 0 }] },
      { code: Cmd.ShopProcessing, indent: 0, parameters: [[[0, 2, 0, 10], [1, 1, 0, 20]], true] },
      { code: Cmd.ShowText, indent: 0, parameters: ["Actor1", 0, 0, 2] },
    ]);

    const { refs } = buildRefGraph(ir);
    const byCat = (cat: string) => refs.filter((r) => r.category === cat).map((r) => r.target);

    expect(byCat("switch").sort()).toEqual(["12", "5"]);
    expect(byCat("variable")).toEqual(["3"]);
    expect(byCat("map")).toContain("99");
    expect(byCat("commonEvent")).toEqual(["7"]);
    expect(byCat("item")).toEqual(["2"]);
    expect(byCat("weapon")).toEqual(["1"]);
    expect(byCat("asset")).toEqual(expect.arrayContaining(["img/pictures/Logo.png", "audio/bgm/Town", "img/faces/Actor1.png"]));
  });

  it("空名不产生引用", () => {
    const ir = irWith([{ code: Cmd.ShowPicture, indent: 0, parameters: [1, "", 1, 0, 0, 100, 100, 255, 0] }]);
    const { refs } = buildRefGraph(ir);
    expect(refs.filter((r) => r.target.startsWith("img/pictures/"))).toEqual([]);
  });

  it("嵌套命令带正确位置", () => {
    const ir = irWith([
      { code: Cmd.ConditionalBranch, indent: 0, parameters: [0, 5] },
      { code: Cmd.TransferPlayer, indent: 1, parameters: [99, 1, 1, 0, 0] },
    ]);
    const { refs } = buildRefGraph(ir);
    const transfer = refs.find((r) => r.category === "map" && r.target === "99")!;
    expect(transfer.location).toMatchObject({ mapId: 1, eventId: 1, pageIndex: 0, commandIndex: 1 });
  });
});
