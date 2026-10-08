import { describe, expect, it } from "vitest";
import { Cmd } from "@rmtest/core";
import { parseData } from "../src/parse.ts";
import { encodeMarshal } from "./marshal-helpers.ts";

const sym = (s: string) => ({ $sym: s });
const obj = (cls: string, ivars: Record<string, unknown>) => ({ $obj: { cls, ivars } });
const hash = (pairs: Array<[unknown, unknown]>) => ({ $hash: pairs });

/** 构造最小 VX Ace 工程数据（合成 Marshal 字节） */
function buildFixture(): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  files["System.rvdata2"] = encodeMarshal(
    obj("RPG::System", {
      "@game_title": "RGSS测试",
      "@switches": [null, "任务开关", "门已开"],
      "@variables": [null, "计数"],
      "@start_map_id": 1,
      "@start_x": 2,
      "@start_y": 2,
    }),
  );

  files["MapInfos.rvdata2"] = encodeMarshal(
    hash([[1, obj("RPG::MapInfo", { "@name": "MAP001", "@order": 1, "@parent_id": 0 })]]),
  );

  const event = obj("RPG::Event", {
    "@id": 1,
    "@name": "EV001",
    "@x": 2,
    "@y": 2,
    "@pages": [
      obj("RPG::Event::Page", {
        "@condition": obj("RPG::Event::Page::Condition", {
          "@switch1_valid": false,
          "@switch1_id": 1,
          "@switch2_valid": false,
          "@switch2_id": 1,
          "@variable_valid": false,
          "@variable_id": 1,
          "@self_switch_valid": false,
          "@self_switch_ch": "A",
          "@item_valid": false,
          "@item_id": 1,
          "@actor_valid": false,
          "@actor_id": 1,
        }),
        "@list": [
          obj("RPG::EventCommand", { "@code": 121, "@indent": 0, "@parameters": [1, 1, 0] }),
          obj("RPG::EventCommand", { "@code": 201, "@indent": 0, "@parameters": [0, 1, 2, 2, 0, 0] }),
          obj("RPG::EventCommand", { "@code": 0, "@indent": 0, "@parameters": [] }),
        ],
        "@trigger": 0,
        "@priority_type": 1,
      }),
    ],
  });

  files["Map001.rvdata2"] = encodeMarshal(
    obj("RPG::Map", {
      "@width": 5,
      "@height": 4,
      "@tileset_id": 1,
      "@parallax_name": "",
      "@events": hash([[1, event]]),
    }),
  );

  files["Actors.rvdata2"] = encodeMarshal([
    null,
    obj("RPG::Actor", {
      "@id": 1,
      "@name": "勇者",
      "@class_id": 1,
      "@character_name": "Actor1",
      "@character_index": 0,
      "@face_name": "Actor1",
      "@face_index": 0,
    }),
  ]);

  files["CommonEvents.rvdata2"] = encodeMarshal([
    null,
    obj("RPG::CommonEvent", { "@id": 1, "@name": "公共事件1", "@trigger": 0, "@switch_id": 1, "@list": [] }),
  ]);

  files["Items.rvdata2"] = encodeMarshal([null, obj("RPG::Item", { "@id": 1, "@name": "药水", "@icon_index": 5 })]);
  files["Skills.rvdata2"] = encodeMarshal([null, obj("RPG::Skill", { "@id": 1, "@name": "火球", "@icon_index": 2 })]);
  files["Troops.rvdata2"] = encodeMarshal([
    null,
    obj("RPG::Troop", { "@id": 1, "@name": "哥布林", "@members": [obj("RPG::Troop::Member", { "@enemy_id": 1 })] }),
  ]);
  files["Enemies.rvdata2"] = encodeMarshal([null, obj("RPG::Enemy", { "@id": 1, "@name": "哥布林", "@battler_name": "Goblin" })]);
  files["Classes.rvdata2"] = encodeMarshal([null, obj("RPG::Class", { "@id": 1, "@name": "战士" })]);

  return files;
}

describe("RGSS 数据 → IR", () => {
  const { ir, warnings } = parseData(buildFixture());

  it("系统与地图解析", () => {
    expect(warnings).toEqual([]);
    expect(ir.engine).toBe("rgss");
    expect(ir.system.title).toBe("RGSS测试");
    expect(ir.system.switches[1]).toBe("任务开关");
    expect([ir.system.startMapId, ir.system.startX, ir.system.startY]).toEqual([1, 2, 2]);
    expect(ir.maps).toHaveLength(1);
    expect(ir.maps[0]).toMatchObject({ id: 1, name: "MAP001", width: 5, height: 4, tilesetId: 1 });
  });

  it("事件与命令解析（含 201 六参格式）", () => {
    const ev = ir.maps[0]!.events[0]!;
    expect(ev.name).toBe("EV001");
    expect(ev.pages).toHaveLength(1);
    const codes = ev.pages[0]!.commands.map((c) => c.code);
    expect(codes).toEqual([Cmd.ControlSwitches, Cmd.TransferPlayer, Cmd.End]);
    expect(ev.pages[0]!.commands[1]!.parameters.slice(0, 4)).toEqual([0, 1, 2, 2]);
  });

  it("数据库域解析", () => {
    expect(ir.actors[0]!.name).toBe("勇者");
    expect(ir.commonEvents[0]!.name).toBe("公共事件1");
    expect(ir.items[0]!.iconIndex).toBe(5);
    expect(ir.troops[0]!.enemyIds).toEqual([1]);
    expect(ir.enemies[0]!.battlerName).toBe("Goblin");
    expect(ir.classes[0]!.name).toBe("战士");
  });
});
