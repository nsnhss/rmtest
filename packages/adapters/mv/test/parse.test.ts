import { describe, expect, it } from "vitest";
import { Cmd, parseData } from "../src/parse.ts";
import { loadFixtureData } from "./helpers.ts";

describe("MV 数据解析 → IR", () => {
  const { ir, warnings } = parseData(loadFixtureData());

  it("解析出 2 张地图且无警告", () => {
    expect(ir.maps).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it("系统信息正确", () => {
    expect(ir.system.title).toBe("MiniFixture");
    expect(ir.system.switches[1]).toBe("任务开关");
    expect(ir.system.variables[1]).toBe("计数");
    expect([ir.system.startMapId, ir.system.startX, ir.system.startY]).toEqual([1, 2, 2]);
  });

  it("事件页与命令正确解析", () => {
    const map = ir.maps[0]!;
    expect(map.name).toBe("MAP001");
    expect(map.width).toBe(5);
    expect(map.height).toBe(4);
    expect(map.data).toHaveLength(20);

    const ev1 = map.events.find((e) => e.id === 1)!;
    expect(ev1.name).toBe("EV001");
    expect(ev1.pages).toHaveLength(1);
    const page = ev1.pages[0]!;
    expect(page.trigger).toBe(0);
    const codes = page.commands.map((c) => c.code);
    expect(codes).toEqual([Cmd.ShowText, Cmd.ShowTextCont, Cmd.ControlSwitches, Cmd.TransferPlayer, Cmd.End]);
    // 传送参数 [mapId, x, y, dir, fade]
    const transfer = page.commands[3]!;
    expect(transfer.parameters.slice(0, 3)).toEqual([2, 2, 2]);
  });

  it("页条件解析：EV002 需要开关 1 为 ON", () => {
    const ev2 = ir.maps[0]!.events.find((e) => e.id === 2)!;
    const cond = ev2.pages[0]!.conditions;
    expect(cond.switch1Id).toBe(1);
    expect(cond.switch2Id).toBeNull();
    expect(cond.selfSwitchCh).toBeNull();
  });

  it("公共事件与角色解析", () => {
    expect(ir.commonEvents).toHaveLength(1);
    expect(ir.commonEvents[0]!.name).toBe("公共事件1");
    expect(ir.commonEvents[0]!.switchId).toBe(1);
    expect(ir.actors[0]!.faceName).toBe("Actor1");
  });

  it("数据库与资源域解析", () => {
    expect(ir.tilesets[0]!.imageNames.slice(0, 3)).toEqual(["", "Outside_A1", "Outside_A2"]);
    expect(ir.items.map((i) => i.iconIndex)).toEqual([5, 10]);
    expect(ir.weapons).toHaveLength(1);
    expect(ir.troops[0]!.enemyIds).toEqual([1, 2]);
    expect(ir.enemies[0]!.battlerName).toBe("Goblin");
    expect(ir.animations[0]!.image1Name).toBe("Fire");
    expect(ir.classes[0]!.name).toBe("战士");
  });

  it("系统扩展字段解析", () => {
    expect(ir.system.title1Name).toBe("Title1");
    expect(ir.system.sounds.bgm.name).toBe("Theme1");
    expect(ir.system.vehicles.boat.characterName).toBe("Vehicle");
  });

  it("地图扩展字段解析", () => {
    const map = ir.maps[0]!;
    expect(map.tilesetId).toBe(1);
    expect(map.encounterTroopIds).toEqual([1]);
  });
});

describe("容错：坏数据不崩", () => {
  it("MapInfos 指向缺失的地图文件 → 警告而非异常", () => {
    const files = loadFixtureData();
    delete files["Map001.json"];
    const result = parseData(files);
    expect(result.ir.maps).toHaveLength(1);
    expect(result.ir.maps[0]!.id).toBe(2);
    expect(result.warnings.some((w) => w.includes("缺少数据文件"))).toBe(true);
  });

  it("events 为空/null 不崩", () => {
    const files = loadFixtureData();
    const map = files["Map001.json"] as Record<string, unknown>;
    map["events"] = null;
    const result = parseData(files);
    expect(result.ir.maps[0]!.events).toEqual([]);
  });
});
