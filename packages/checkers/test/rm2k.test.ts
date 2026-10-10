/**
 * RM2k/2k3 检查器集成测试 —— 二进制编码器 → 磁盘工程 → 加载器 → 检查器全链路。
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildLifecycle, buildRefGraph, runCheckers, type CheckRunResult } from "@rmtest/core";
import { Enc, withHeader, loadProject, type LoadedProject } from "@rmtest/adapter-rm2k";
import { checkers } from "../src/index.ts";

const body = (e: Enc): number[] => Array.from(e.out);

/** 构造完整合成工程（可注入 bug） */
function buildProject(dir: string, opts: { orphanMap3?: boolean } = {}): void {
  mkdirSync(dir, { recursive: true });

  // ---- LMT：树 = 地图1（根下）、地图2、区域10 ----
  const lmt = new Enc()
    .int(3)
    .int(1).raw(body(new Enc().strField(0x01, "第一幕").intField(0x02, 0).intField(0x04, 1))).int(0)
    .int(2).raw(body(new Enc().strField(0x01, "第二幕").intField(0x02, 0).intField(0x04, 1))).int(0)
    .int(10).raw(body(new Enc().strField(0x01, "大陆").intField(0x02, 0).intField(0x04, 2))).int(0)
    .int(2).int(1).int(2) // tree_order
    .int(0) // active_node
    .raw(body(new Enc().intField(0x01, 1).intField(0x02, 5).intField(0x03, 5))); // start 地图1 (5,5)
  writeFileSync(path.join(dir, "RPG_RT.lmt"), withHeader("LcfMapTree", lmt));

  // ---- LDB：5 开关 3 变量，公共事件 1/2，图块集 1 ----
  const db = new Enc()
    .structVecField(0x17, Array.from({ length: 5 }, (_, i) => ({ id: i + 1, body: body(new Enc().strField(0x01, `S${i + 1}`)) })))
    .structVecField(0x18, Array.from({ length: 3 }, (_, i) => ({ id: i + 1, body: body(new Enc().strField(0x01, `V${i + 1}`)) })))
    .structVecField(0x19, [
      { id: 1, body: body(new Enc().strField(0x01, "开场")) },
      { id: 2, body: body(new Enc().strField(0x01, "结尾")) },
    ])
    .structVecField(0x14, [{ id: 1, body: body(new Enc().strField(0x01, "草原")) }])
    .intField(0x1a, 2);
  writeFileSync(path.join(dir, "RPG_RT.ldb"), withHeader("LcfDataBase", db));

  // ---- Map0001：满身 bug ----
  const cond = new Enc().intField(0x02, 9); // 页条件：开关 9（超范围）
  const page = new Enc()
    .structField(0x02, body(cond))
    .strField(0x15, "hero") // 行走图（缺失）
    .intField(0x21, 0)
    .commandsField(0x34, [
      Enc.command(10810, 0, "", [99, 1, 1, 0, 2]), // 传送到不存在的 99
      Enc.command(10810, 0, "", [2, 100, 100, 0, 2]), // 越界
      Enc.command(10810, 0, "", [10, 1, 1, 0, 2]), // 区域
      Enc.command(10210, 0, "", [0, 7, 7, 1]), // 开关 7 越界
      Enc.command(1005, 0, "", [5]), // 公共事件 5 缺失
      Enc.command(11510, 0, "GhostMusic", [0, 90, 100, 50]), // 音乐缺失
      Enc.command(11710, 0, "", [3]), // 图块集 3 缺失
    ]);
  const ev = new Enc().strField(0x01, "EV1").intField(0x02, 3).intField(0x03, 4).structVecField(0x05, [{ id: 1, body: body(page) }]);
  const map1 = new Enc().intField(0x01, 1).intField(0x02, 20).intField(0x03, 15).structVecField(0x51, [{ id: 1, body: body(ev) }]);
  writeFileSync(path.join(dir, "Map0001.lmu"), withHeader("LcfMapUnit", map1));

  // ---- Map0002：合法 ----
  const page2 = new Enc().intField(0x21, 0).commandsField(0x34, [Enc.command(11510, 0, "Town", [0, 90, 100, 50])]);
  const map2 = new Enc().intField(0x01, 1).intField(0x02, 10).intField(0x03, 10).structVecField(0x51, [{ id: 2, body: body(new Enc().strField(0x01, "E2").structVecField(0x05, [{ id: 1, body: body(page2) }])) }]);
  writeFileSync(path.join(dir, "Map0002.lmu"), withHeader("LcfMapUnit", map2));

  if (opts.orphanMap3) {
    const map3 = new Enc().intField(0x01, 1).intField(0x02, 5).intField(0x03, 5);
    writeFileSync(path.join(dir, "Map0003.lmu"), withHeader("LcfMapUnit", map3));
  }

  mkdirSync(path.join(dir, "Music"), { recursive: true });
  writeFileSync(path.join(dir, "Music", "town.mid"), "midi");
}

function run(dir: string): CheckRunResult {
  const loaded = loadProject(dir) as LoadedProject;
  const facts = {
    refgraph: buildRefGraph(loaded.ir),
    lifecycle: buildLifecycle(loaded.ir),
    universe: loaded.universe,
    assets: loaded.assets,
  };
  return runCheckers(checkers, facts, loaded.ir);
}

describe("RM2k/2k3 检查器", () => {
  it("满身 bug 工程 → 各类检查全命中", () => {
    const dir = path.join(os.tmpdir(), `rmtest-rm2k-${process.pid}-${Math.random().toString(36).slice(2)}`);
    buildProject(dir, { orphanMap3: true });
    try {
      const sections = run(dir).sections.filter((s) => s.type.startsWith("rm2k-"));

      const teleport = sections.filter((s) => s.type === "rm2k-teleport");
      expect(teleport.some((s) => s.message.includes("99"))).toBe(true);
      expect(teleport.some((s) => s.message.includes("100, 100"))).toBe(true);
      expect(teleport.some((s) => s.severity === "warning" && s.message.includes("区域"))).toBe(true);

      const refs = sections.filter((s) => s.type === "rm2k-dangling-ref");
      expect(refs.some((s) => s.message.includes("开关 9"))).toBe(true);
      expect(refs.some((s) => s.message.includes("开关 7"))).toBe(true);
      expect(refs.some((s) => s.message.includes("公共事件 5"))).toBe(true);
      expect(refs.some((s) => s.message.includes("图块集 3"))).toBe(true);

      const tree = sections.filter((s) => s.type === "rm2k-map-tree");
      expect(tree.some((s) => s.message.includes("地图 3") && s.message.includes("不在地图树"))).toBe(true);

      const assets = sections.filter((s) => s.type === "rm2k-missing-asset");
      expect(assets.some((s) => s.message.includes("GhostMusic"))).toBe(true);
      expect(assets.some((s) => s.message.includes("hero"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("合法工程 → 零 RM2k 报告", () => {
    const dir = path.join(os.tmpdir(), `rmtest-rm2k-${process.pid}-${Math.random().toString(36).slice(2)}`);
    // 干净版：Map0002 单独构造（无 bug 命令）
    mkdirSync(dir, { recursive: true });
    const lmt = new Enc()
      .int(1)
      .int(1).raw(body(new Enc().strField(0x01, "T").intField(0x02, 0).intField(0x04, 1))).int(0)
      .int(0)
      .int(0)
      .raw(body(new Enc().intField(0x01, 1).intField(0x02, 1).intField(0x03, 1)));
    writeFileSync(path.join(dir, "RPG_RT.lmt"), withHeader("LcfMapTree", lmt));
    const db = new Enc()
      .structVecField(0x17, [{ id: 1, body: body(new Enc().strField(0x01, "S1")) }])
      .structVecField(0x18, [{ id: 1, body: body(new Enc().strField(0x01, "V1")) }])
      .intField(0x1a, 2);
    writeFileSync(path.join(dir, "RPG_RT.ldb"), withHeader("LcfDataBase", db));
    const map1 = new Enc().intField(0x01, 1).intField(0x02, 5).intField(0x03, 5);
    writeFileSync(path.join(dir, "Map0001.lmu"), withHeader("LcfMapUnit", map1));
    try {
      const result = run(dir);
      expect(result.errors).toEqual([]);
      expect(result.sections.filter((s) => s.type.startsWith("rm2k-"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
