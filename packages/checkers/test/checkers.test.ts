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
        transfer["parameters"] = [0, 2, 9, 9, 0, 0];
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

  it("CJK 文本 + 无 CJK 字体 → font-check 告警", () => {
    const assets = fullAssets();
    delete assets["fonts/MyCjkFont.ttf"];
    const p = buildProject(assets);
    try {
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "font-check");
      expect(hit).toHaveLength(1);
      expect(hit[0]).toMatchObject({ severity: "warning", confidence: "medium" });
    } finally {
      p.destroy();
    }
  });

  it("写入点全在判断之后 → first-run-false", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        const list = page["list"] as Array<Record<string, unknown>>;
        // 开关 2：页内唯一写入在判断之后
        list.splice(list.length - 1, 0, { code: 111, indent: 0, parameters: [0, 2] });
        list.splice(list.length - 1, 0, { code: 121, indent: 1, parameters: [2, 2, 0] });
        list.splice(list.length - 1, 0, { code: 412, indent: 0, parameters: [] });
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "first-run-false");
      expect(hit).toHaveLength(1);
      expect(hit[0]).toMatchObject({ severity: "warning", confidence: "medium" });
      expect(hit[0]!.message).toContain("开关 2");
    } finally {
      p.destroy();
    }
  });

  it("页内写入在后且无外部写入 → 报；有外部写入 → 不报", () => {
    const p = buildProject(fullAssets());
    try {
      // 开关 2：页内写入在判断后，页外无写入（公共事件写的是开关 1）→ 报
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        const list = page["list"] as Array<Record<string, unknown>>;
        list.splice(list.length - 1, 0, { code: 111, indent: 0, parameters: [0, 2] });
        list.splice(list.length - 1, 0, { code: 121, indent: 1, parameters: [2, 2, 0] });
        list.splice(list.length - 1, 0, { code: 412, indent: 0, parameters: [] });
      });
      let sections = run(p.loaded()).sections;
      expect(sections.filter((s) => s.type === "first-run-false" && s.message.includes("开关 2"))).toHaveLength(1);

      // 开关 1：公共事件也写它（页外写入）→ 无法证明，不报
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        const list = page["list"] as Array<Record<string, unknown>>;
        list.splice(list.length - 1, 0, { code: 111, indent: 0, parameters: [0, 1] });
        list.splice(list.length - 1, 0, { code: 121, indent: 1, parameters: [1, 1, 0] });
        list.splice(list.length - 1, 0, { code: 412, indent: 0, parameters: [] });
      });
      sections = run(p.loaded()).sections;
      expect(sections.filter((s) => s.type === "first-run-false" && s.message.includes("开关 1"))).toHaveLength(0);
    } finally {
      p.destroy();
    }
  });

  it("星号瓦片（0x10）视为不可走 → 传送软锁", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Tilesets.json", (d) => {
        const arr = d as unknown as Array<Record<string, unknown> | null>;
        arr[1]!["flags"] = [0, 16]; // tile 1 = 星号（水面类）
      });
      p.writeJson("Map002.json", (d) => {
        const data = d["data"] as unknown[];
        data[2 * 5 + 2] = 1; // (2,2) 换成星号瓦片
      });
      const sections = run(p.loaded()).sections;
      const hit = sections.filter((s) => s.type === "transfer-softlock" && s.message.includes("不可走"));
      expect(hit).toHaveLength(1);
    } finally {
      p.destroy();
    }
  });

  it("页面由同一开关门控 → 不报恒假（该开关必为 ON）", () => {
    const p = buildProject(fullAssets());
    try {
      // EV002 页由开关 2 门控，页内判断开关 2 之后再写开关 2：
      // 页面运行即意味着开关 2 为 ON，故"首次触发恒假"不成立
      p.writeJson("Map001.json", (d) => {
        const ev2 = (d["events"] as Array<Record<string, unknown> | null>)[2]!;
        const page = (ev2["pages"] as Array<Record<string, unknown>>)[0]!;
        const cond = page["conditions"] as Record<string, unknown>;
        cond["switch1Id"] = 2;
        cond["switch1Valid"] = true;
        (page["list"] as Array<Record<string, unknown>>).splice(
          -1,
          0,
          { code: 111, indent: 0, parameters: [0, 2] },
          { code: 121, indent: 1, parameters: [2, 2, 0] },
          { code: 412, indent: 0, parameters: [] },
        );
      });
      expect(run(p.loaded()).sections.filter((s) => s.type === "first-run-false")).toEqual([]);
    } finally {
      p.destroy();
    }
  });

  it("公共事件内的传送 → 目标地图可达且软锁可见", () => {
    const p = buildProject(fullAssets());
    try {
      // 移除地图事件中通往地图 2 的传送；改由公共事件传送（越界坐标 → 软锁）
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        const list = page["list"] as Array<Record<string, unknown>>;
        list.splice(
          list.findIndex((c) => c["code"] === 201),
          1,
        );
      });
      p.writeJson("CommonEvents.json", (d) => {
        const ce = (d as unknown as unknown[])[1] as Record<string, unknown>;
        (ce["list"] as Array<Record<string, unknown>>).splice(-1, 0, { code: 201, indent: 0, parameters: [0, 2, 99, 99, 0, 0] });
      });
      const sections = run(p.loaded()).sections;
      // 地图 2 仅经公共事件可达 → 不得报不可达
      expect(sections.filter((s) => s.type === "unreachable-map" && s.message.includes("地图 2"))).toHaveLength(0);
      // 公共事件内的越界传送 → 软锁可见
      const soft = sections.filter((s) => s.type === "transfer-softlock" && s.location?.dataKey === "commonEvent");
      expect(soft).toHaveLength(1);
      expect(soft[0]!.message).toContain("越界");
    } finally {
      p.destroy();
    }
  });

  it("公共事件内的图片与脸图引用 → 被对应检查器覆盖", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("CommonEvents.json", (d) => {
        const ce = (d as unknown as unknown[])[1] as Record<string, unknown>;
        (ce["list"] as Array<Record<string, unknown>>).splice(
          -1,
          0,
          { code: 231, indent: 0, parameters: [1, "", 1, 2000, 2000, 100, 100, 255, 0] }, // 锚点出屏
          { code: 101, indent: 0, parameters: ["Actor1", 8, 0, 2] }, // 脸图索引越界
          { code: 401, indent: 1, parameters: ["hi"] },
        );
      });
      const common = run(p.loaded()).sections.filter((s) => s.location?.dataKey === "commonEvent");
      expect(common.some((s) => s.type === "picture-offscreen")).toBe(true);
      expect(common.some((s) => s.type === "picture-no-erase")).toBe(true);
      expect(common.filter((s) => s.type === "face-index")).toHaveLength(1);
    } finally {
      p.destroy();
    }
  });

  it("韩文（谚文）标题/对话 + 无 CJK 字体 → font-check 告警", () => {
    const assets = fullAssets();
    delete assets["fonts/MyCjkFont.ttf"];
    const p = buildProject(assets);
    try {
      // 全工程文本改为韩文，避免残留中文掩盖谚文缺字
      p.writeJson("System.json", (d) => {
        d["gameTitle"] = "한국어 게임";
      });
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        const line = (page["list"] as Array<Record<string, unknown>>).find((c) => c["code"] === 401)!;
        line["parameters"] = ["안녕하세요 세계"];
      });
      expect(run(p.loaded()).sections.filter((s) => s.type === "font-check")).toHaveLength(1);
    } finally {
      p.destroy();
    }
  });

  it("韩文（谚文）按全角计宽 → 超长才报 text-overflow", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        (page["list"] as Array<Record<string, unknown>>).splice(
          -1,
          0,
          { code: 101, indent: 0, parameters: ["", 0, 0, 2] },
          // 42 个谚文音节：按全角 28px 计 = 1176px > 可用 780px → 报；
          // 若按半角计（14px）只有 588px，不会报——故本条同时证明谚文被当作全角。
          { code: 401, indent: 1, parameters: ["가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하"] },
        );
      });
      const hit = run(p.loaded()).sections.filter((s) => s.type === "text-overflow");
      expect(hit).toHaveLength(1);
      const { evidence } = hit[0]!;
      if (evidence === null || typeof evidence !== "object" || !("width" in evidence)) {
        throw new Error("text-overflow 报告缺少 width 证据");
      }
      expect(evidence.width).toBe(42 * 28);
    } finally {
      p.destroy();
    }
  });

  it("CJK 计宽单位与容量一致：25 个全角字（700px < 780px）不误报", () => {
    const p = buildProject(fullAssets());
    try {
      p.writeJson("Map001.json", (d) => {
        const ev1 = (d["events"] as Array<Record<string, unknown> | null>)[1]!;
        const page = (ev1["pages"] as Array<Record<string, unknown>>)[0]!;
        (page["list"] as Array<Record<string, unknown>>).splice(
          -1,
          0,
          { code: 101, indent: 0, parameters: ["", 0, 0, 2] },
          // 25 个全角字 = 700px，仍在 816 窗口内（可用 780px）→ 不得报。
          // 修复前容量按“字数”计（27）却拿“半角单位宽度”（50）比较，必然误报。
          { code: 401, indent: 1, parameters: ["一二三四五六七八九十一二三四五六七八九十一二三四五"] },
        );
      });
      const hit = run(p.loaded()).sections.filter((s) => s.type === "text-overflow");
      expect(hit).toEqual([]);
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
