import { describe, expect, it } from "vitest";
import { parseLdb, parseLmt, parseLmu } from "../src/parse.ts";
import { Enc, withHeader } from "../src/enc.ts";

const body = (e: Enc): number[] => Array.from(e.out);

describe("LMT 地图树解析", () => {
  it("地图/区域/起始位置", () => {
    const map1 = new Enc().strField(0x01, "Town").intField(0x02, 0).intField(0x04, 1); // type map
    const map2 = new Enc().strField(0x01, "Dungeon").intField(0x02, 1).intField(0x04, 2); // type area
    const lmt = new Enc()
      .int(2)
      .int(1)
      .raw(body(map1))
      .int(0)
      .int(2)
      .raw(body(map2))
      .int(0)
      .int(2)
      .int(1)
      .int(2) // tree_order
      .int(0) // active_node
      .raw(body(new Enc().intField(0x01, 1).intField(0x02, 5).intField(0x03, 6))); // start

    const parsed = parseLmt(withHeader("LcfMapTree", lmt));
    expect(parsed.maps).toHaveLength(2);
    expect(parsed.maps[0]).toMatchObject({ id: 1, name: "Town", parent: 0, type: 1 });
    expect(parsed.maps[1]).toMatchObject({ id: 2, name: "Dungeon", parent: 1, type: 2 });
    expect(parsed.start).toEqual({ mapId: 1, x: 5, y: 6 });
  });
});

describe("LMU 地图解析", () => {
  it("尺寸/事件/页/命令（含 Teleport 与字符串命令）", () => {
    const page = new Enc()
      .intField(0x21, 0) // trigger
      .commandsField(0x34, [
        Enc.command(10810, 0, "", [3, 2, 1, 0, 2]), // Teleport → map 3 (2,1)
        Enc.command(11510, 0, "Town", [0, 90, 100, 50]), // PlayBGM "Town"
      ]);
    const ev = new Enc()
      .strField(0x01, "EV1")
      .intField(0x02, 2)
      .intField(0x03, 3)
      .structVecField(0x05, [{ id: 1, body: body(page) }]);
    const map = new Enc()
      .intField(0x01, 7) // chipset
      .intField(0x02, 20) // width
      .intField(0x03, 15) // height
      .structVecField(0x51, [{ id: 5, body: body(ev) }]);

    const parsed = parseLmu(withHeader("LcfMapUnit", map));
    expect(parsed.chipsetId).toBe(7);
    expect(parsed.width).toBe(20);
    expect(parsed.height).toBe(15);
    expect(parsed.events).toHaveLength(1);
    const e = parsed.events[0]!;
    expect(e).toMatchObject({ id: 5, name: "EV1", x: 2, y: 3 });
    expect(e.pages).toHaveLength(1);
    const cmds = e.pages[0]!.commands;
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).toMatchObject({ code: 10810, indent: 0, string: "", parameters: [3, 2, 1, 0, 2] });
    expect(cmds[1]).toMatchObject({ code: 11510, string: "Town", parameters: [0, 90, 100, 50] });
  });
});

describe("LDB 数据库解析", () => {
  it("开关/变量/公共事件/图块集/动画/版本", () => {
    const ce = new Enc().strField(0x01, "开场").commandsField(0x16, [Enc.command(1005, 0, "", [2])]);
    const sw1 = new Enc().strField(0x01, "开关1");
    const sw2 = new Enc().strField(0x01, "开关2");
    const v1 = new Enc().strField(0x01, "变量1");
    const chip = new Enc().strField(0x01, "草原");
    const anim = new Enc().strField(0x02, "Slash");
    const db = new Enc()
      .structVecField(0x17, [
        { id: 1, body: body(sw1) },
        { id: 2, body: body(sw2) },
      ])
      .structVecField(0x18, [{ id: 1, body: body(v1) }])
      .structVecField(0x19, [{ id: 3, body: body(ce) }])
      .structVecField(0x14, [{ id: 1, body: body(chip) }])
      .structVecField(0x13, [{ id: 9, body: body(anim) }])
      .intField(0x1a, 2);

    const parsed = parseLdb(withHeader("LcfDataBase", db));
    expect(parsed.version).toBe(2);
    expect(parsed.switches[0]).toBe("开关1");
    expect(parsed.switches[1]).toBe("开关2");
    expect(parsed.variables[0]).toBe("变量1");
    expect(parsed.commonEvents).toHaveLength(1);
    expect(parsed.commonEvents[0]).toMatchObject({ id: 3, name: "开场" });
    expect(parsed.commonEvents[0]!.commands[0]).toMatchObject({ code: 1005, parameters: [2] });
    expect(parsed.chipsets[1]).toBe("草原");
    expect(parsed.animations[9]).toBe("Slash");
  });
});
