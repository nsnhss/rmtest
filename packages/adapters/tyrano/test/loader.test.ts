import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadProject } from "../src/loader.ts";

function buildProject(files: Record<string, string>): string {
  const dir = path.join(os.tmpdir(), `rmtest-tyrano-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const FIRST_KS = [
  "*start",
  "[bg storage=\"room.png\"]",
  "[jump target=*next]",
  "*next",
  "[chara_new name=\"yukino\" storage=\"yukino.png\"]",
  "[jump target=*other storage=other.ks]",
  "[end]",
].join("\n");

const OTHER_KS = ["*other", "[playbgm storage=\"town.ogg\"]", "[return]", ""].join("\n");

describe("TyranoScript 工程加载", () => {
  it("完整工程 → IR 与资产清单", () => {
    const dir = buildProject({
      "index.html": "<html></html>",
      "data/system/Config.tjs": 'firstScenario = "first.ks";\nfirstLabel = "*start";\ntitle = "テストゲーム";',
      "data/scenario/first.ks": FIRST_KS,
      "data/scenario/other.ks": OTHER_KS,
      "data/bgimage/room.png": "not-a-real-png",
      "data/fgimage/yukino.png": "x",
      "data/bgm/town.ogg": "y",
    });
    try {
      const p = loadProject(dir);
      expect(p.warnings).toEqual([]);
      expect(p.ir.engine).toBe("tyrano");
      expect(p.ir.schemaVersion).toBe(2);
      expect(p.ir.system.title).toBe("テストゲーム");

      const t = p.ir.tyrano!;
      expect(t.entryScenario).toBe("first.ks");
      expect(t.entryLabel).toBe("*start");
      expect(t.scenarios.map((s) => s.file)).toEqual(["first.ks", "other.ks"]);
      expect(t.scenarios[0]!.labels.map((l) => l.name)).toEqual(["start", "next"]);
      expect(t.assets).toEqual({ bg: ["room.png"], fg: ["yukino.png"], image: [], se: [], bgm: ["town.ogg"], voice: [], video: [] });

      expect(p.universe.assetFiles.has("data/bgimage/room.png")).toBe(true);
      expect(p.fileHashes.has("data/scenario/first.ks")).toBe(true);
      expect(p.fileHashes.has("index.html")).toBe(true);
      expect(p.fingerprint).toHaveLength(16);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("缺配置与入口 → 默认入口 + 警告", () => {
    const dir = buildProject({
      "data/scenario/first.ks": FIRST_KS,
    });
    try {
      const p = loadProject(dir);
      expect(p.ir.tyrano!.entryScenario).toBe("first.ks");
      expect(p.ir.tyrano!.entryLabel).toBe("*start");
      expect(p.warnings).toEqual([
        "缺少 data/system/Config.tjs，按默认入口（first.ks/*start）处理",
        "缺少 index.html（TyranoScript 运行入口）",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("无场景 → 警告且场景清单为空", () => {
    const dir = buildProject({ "index.html": "<html></html>" });
    try {
      const p = loadProject(dir);
      expect(p.ir.tyrano!.scenarios).toEqual([]);
      expect(p.warnings).toContain("缺少 data/scenario/*.ks 场景文件");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
