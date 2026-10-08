import { describe, expect, it } from "vitest";
import { buildLifecycle, buildRefGraph, runCheckers, type CheckerPlugin, type CheckRunResult } from "@rmtest/core";
import type { LoadedProject } from "@rmtest/adapter-mv";
import { checkers } from "../src/index.ts";
import { buildProject, fullAssets, makePng } from "./helpers.ts";

function run(loaded: LoadedProject): CheckRunResult {
  const facts = {
    refgraph: buildRefGraph(loaded.ir),
    lifecycle: buildLifecycle(loaded.ir),
    universe: loaded.universe,
    assets: loaded.assets,
  };
  return runCheckers(checkers, facts, loaded.ir);
}

describe("checkers v1", () => {
  it("完全合法工程 → 零报告", () => {
    const p = buildProject(fullAssets());
    try {
      const result = run(p.loaded());
      expect(result.errors).toEqual([]);
      expect(result.sections).toEqual([]);
    } finally {
      p.destroy();
    }
  });

  it("缺失资源 → dangling-ref 高置信 error", () => {
    const assets = fullAssets();
    delete assets["img/enemies/Goblin.png"];
    const p = buildProject(assets);
    try {
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "dangling-ref" && s.message.includes("Goblin.png"));
      // 两个敌人都引用 Goblin.png → 各自报一条
      expect(hit).toHaveLength(2);
      expect(hit[0]).toMatchObject({ severity: "error", confidence: "high" });
      expect(hit.map((h) => h.location).sort((a, b) => (a!.dataId ?? 0) - (b!.dataId ?? 0))).toEqual([
        { dataKey: "enemy", dataId: 1 },
        { dataKey: "enemy", dataId: 2 },
      ]);
    } finally {
      p.destroy();
    }
  });

  it("大小写不一致 → 降级 warning", () => {
    const assets = fullAssets();
    delete assets["img/faces/Actor1.png"];
    assets["img/faces/actor1.png"] = makePng(144, 144);
    const p = buildProject(assets);
    try {
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "dangling-ref" && s.message.includes("大小写"));
      expect(hit).toHaveLength(1);
      expect(hit[0]).toMatchObject({ severity: "warning", confidence: "low" });
    } finally {
      p.destroy();
    }
  });

  it("行走图规格错误 → asset-dimension", () => {
    const assets = fullAssets();
    assets["img/characters/Actor1.png"] = makePng(100, 200);
    const p = buildProject(assets);
    try {
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "asset-dimension");
      expect(hit.some((s) => s.message.includes("Actor1.png"))).toBe(true);
    } finally {
      p.destroy();
    }
  });

  it("脸图索引越界 → face-index", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Actors.json", (d) => {
        const actors = d as unknown as unknown[];
        (actors[1] as Record<string, unknown>)["faceIndex"] = 8;
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "face-index");
      expect(hit).toHaveLength(1);
      expect(hit[0]!.message).toContain("共 1 张脸");
    } finally {
      p.destroy();
    }
  });

  it("图标索引越界 → icon-index", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Items.json", (d) => {
        const items = d as unknown as unknown[];
        (items[1] as Record<string, unknown>)["iconIndex"] = 300;
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "icon-index");
      expect(hit).toHaveLength(1);
      expect(hit[0]!.message).toContain("300");
    } finally {
      p.destroy();
    }
  });

  it("图片锚点出屏 + 无 Erase → 对应检查器", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        const list = page["list"] as Array<Record<string, unknown>>;
        list.splice(list.length - 1, 0, { code: 231, indent: 0, parameters: [1, "", 1, 2000, 2000, 100, 100, 255, 0] });
      });
      const sections = run(p.loaded()).sections;
      expect(sections.some((s) => s.type === "picture-offscreen")).toBe(true);
      expect(sections.some((s) => s.type === "picture-no-erase")).toBe(true);
    } finally {
      p.destroy();
    }
  });

  it("超长对话行 → text-overflow", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        const list = page["list"] as Array<Record<string, unknown>>;
        list.splice(list.length - 1, 0, { code: 101, indent: 0, parameters: ["", 0, 0, 2] });
        list.splice(list.length - 1, 0, { code: 401, indent: 1, parameters: ["这是一行非常非常非常非常非常非常非常非常非常非常非常长的对话"] });
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "text-overflow");
      expect(hit).toHaveLength(1);
      expect(hit[0]).toMatchObject({ severity: "warning", confidence: "medium" });
    } finally {
      p.destroy();
    }
  });

  it("条件恒假与死逻辑 → 生命周期检查器", () => {
    const p = buildProject(fullAssets());
    try {
      // EV002 页条件从"读开关 1"改为"读开关 2"（开关 2 无人写）→ 恒假
      // 同时开关 1 变成"写了没人读" → 死逻辑
      p.writeJson("Map001.json", (d) => {
        const ev2 = (d["events"] as Array<Record<string, unknown> | null>)[2]!;
        const page = (ev2["pages"] as Array<Record<string, unknown>>)[0]!;
        const cond = page["conditions"] as Record<string, unknown>;
        cond["switch1Id"] = 2;
      });
      const sections = run(p.loaded()).sections;
      const neverWritten = sections.filter((s) => s.type === "read-never-written");
      expect(neverWritten).toHaveLength(1);
      expect(neverWritten[0]!.message).toContain("开关 2");
      expect(neverWritten[0]).toMatchObject({ severity: "error", confidence: "medium" });

      const neverRead = sections.filter((s) => s.type === "written-never-read");
      expect(neverRead).toHaveLength(1);
      expect(neverRead[0]!.message).toContain("开关 1");
      expect(neverRead[0]).toMatchObject({ severity: "info", confidence: "low" });
    } finally {
      p.destroy();
    }
  });

  it("传送越界 → transfer-softlock 高置信", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        const list = page["list"] as Array<Record<string, unknown>>;
        const transfer = list.find((c) => c["code"] === 201)!;
        transfer["parameters"] = [2, 9, 9, 0, 0];
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "transfer-softlock" && s.message.includes("越界"));
      expect(hit).toHaveLength(1);
      expect(hit[0]).toMatchObject({ severity: "error", confidence: "high" });
    } finally {
      p.destroy();
    }
  });

  it("传送到不可走格子 → 卡墙软锁", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Tilesets.json", (d) => {
        const arr = d as unknown as Array<Record<string, unknown> | null>;
        arr[1]!["flags"] = [0, 0xf];
      });
      p.writeJson("Map002.json", (d) => {
        const data = d["data"] as unknown[];
        data[2 * 5 + 2] = 1; // (2,2) 换成阻挡瓦片
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "transfer-softlock" && s.message.includes("不可走"));
      expect(hit).toHaveLength(1);
      expect(hit[0]!.message).toContain("(2, 2)");
    } finally {
      p.destroy();
    }
  });

  it("传送点四周全阻挡 → 无法离开警告", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Tilesets.json", (d) => {
        const arr = d as unknown as Array<Record<string, unknown> | null>;
        arr[1]!["flags"] = [0, 0xf];
      });
      p.writeJson("Map002.json", (d) => {
        const data = d["data"] as unknown[];
        // (2,2) 保持可走，四周 (1,2)(3,2)(2,1)(2,3) 全阻挡
        data[2 * 5 + 2] = 0;
        data[1 * 5 + 2] = 1;
        data[3 * 5 + 2] = 1;
        data[2 * 5 + 1] = 1;
        data[2 * 5 + 3] = 1;
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "transfer-softlock" && s.message.includes("无法离开"));
      expect(hit).toHaveLength(1);
      expect(hit[0]).toMatchObject({ severity: "warning", confidence: "medium" });
    } finally {
      p.destroy();
    }
  });

  it("开局点越界 → 系统级软锁检查", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("System.json", (d) => {
        d["startX"] = 99;
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "transfer-softlock" && s.message.includes("开局"));
      expect(hit).toHaveLength(1);
    } finally {
      p.destroy();
    }
  });

  it("传送被移除 → 地图不可达提示", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        const list = page["list"] as Array<Record<string, unknown>>;
        const idx = list.findIndex((c) => c["code"] === 201);
        list.splice(idx, 1);
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "unreachable-map" && s.message.includes("地图 2"));
      expect(hit).toHaveLength(1);
      expect(hit[0]).toMatchObject({ severity: "info", confidence: "low" });
    } finally {
      p.destroy();
    }
  });

  it("插件抛异常 → 记录错误，其余检查器照跑（内核隔离）", () => {
    const p = buildProject(fullAssets());
    try {
      const boom: CheckerPlugin = {
        manifest: { name: "boom", version: "0", irVersion: 1, facts: [] },
        check: () => {
          throw new Error("boom");
        },
      };
      const loaded = p.loaded();
      const facts = {
        refgraph: buildRefGraph(loaded.ir),
        lifecycle: buildLifecycle(loaded.ir),
        universe: loaded.universe,
        assets: loaded.assets,
      };
      const result = runCheckers([boom, ...checkers], facts, loaded.ir);
      expect(result.errors.some((e) => e.plugin === "boom" && e.message === "boom")).toBe(true);
      expect(result.sections).toEqual([]); // 合法工程其余检查器无报告，证明隔离有效
    } finally {
      p.destroy();
    }
  });
});
