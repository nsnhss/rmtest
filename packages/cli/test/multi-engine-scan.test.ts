/**
 * CLI 接口测试 —— 多引擎工程端到端：detectEngine → loadProjectAny → scan → 报告。
 * 覆盖 TyranoScript / GB Studio / Godot / RM2k 四条新引擎链路（MV/RGSS 已有专项）。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Enc, withHeader } from "@rmtest/adapter-rm2k";
import { detectEngine } from "../src/loader.ts";
import { scan } from "../src/scan.ts";

function tmp(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `rmtest-cli-eng-${prefix}-`));
}

describe("CLI 多引擎接口", () => {
  it("TyranoScript：识别 + 扫描出断链", () => {
    const dir = tmp("tyrano");
    mkdirSync(path.join(dir, "data", "scenario"), { recursive: true });
    mkdirSync(path.join(dir, "data", "system"), { recursive: true });
    writeFileSync(path.join(dir, "index.html"), "<html></html>");
    writeFileSync(path.join(dir, "data", "system", "Config.tjs"), 'firstScenario = "first.ks";\nfirstLabel = "*start";');
    writeFileSync(
      path.join(dir, "data", "scenario", "first.ks"),
      ["*start", "[jump target=*ghost]", "[end]"].join("\n"),
    );
    try {
      expect(detectEngine(dir)).toBe("tyrano");
      const r = scan(dir);
      expect(r.counts.error).toBeGreaterThan(0);
      expect(r.html).toContain("tyrano-broken-jump");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("GB Studio：识别 + 扫描出断链引用", () => {
    const dir = tmp("gbs");
    const project = {
      _version: "4.2.0",
      name: "demo",
      settings: { startSceneId: "s1", startX: 0, startY: 0 },
      scenes: [
        {
          id: "s1",
          name: "S",
          type: "TOPDOWN",
          width: 3,
          height: 3,
          backgroundId: "bg-gone",
          tilesetId: "",
          paletteIds: [],
          spritePaletteIds: [],
          collisions: "009+",
          actors: [],
          triggers: [],
          script: [],
        },
      ],
      customEvents: [],
      spriteSheets: [],
      backgrounds: [],
      tilesets: [],
      sounds: [],
      music: [],
      emotes: [],
      avatars: [],
      fonts: [],
      palettes: [],
    };
    writeFileSync(path.join(dir, "demo.gbsproj"), JSON.stringify(project));
    try {
      expect(detectEngine(dir)).toBe("gbs");
      const r = scan(dir);
      expect(r.counts.error).toBeGreaterThan(0);
      expect(r.html).toContain("gbs-broken-ref");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Godot：识别 + 扫描出缺失资源", () => {
    const dir = tmp("godot");
    mkdirSync(path.join(dir, "scenes"), { recursive: true });
    writeFileSync(path.join(dir, "project.godot"), '[application]\nrun/main_scene="res://scenes/main.tscn"\n');
    writeFileSync(
      path.join(dir, "scenes", "main.tscn"),
      ['[gd_scene format=3]', '[ext_resource type="Script" path="res://scripts/gone.gd" id="1_a"]', '[node name="Main" type="Node2D"]', 'script = ExtResource("1_a")'].join("\n"),
    );
    try {
      expect(detectEngine(dir)).toBe("godot");
      const r = scan(dir);
      expect(r.counts.error).toBeGreaterThan(0);
      expect(r.html).toContain("godot-missing-resource");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("RM2k3：识别 + 扫描出传送断链", () => {
    const dir = tmp("rm2k");
    const body = (e: Enc): number[] => Array.from(e.out);
    const lmt = new Enc()
      .int(1)
      .int(1)
      .raw(body(new Enc().strField(0x01, "T").intField(0x02, 0).intField(0x04, 1)))
      .int(0)
      .int(0)
      .int(0)
      .raw(body(new Enc().intField(0x01, 1).intField(0x02, 1).intField(0x03, 1)));
    writeFileSync(path.join(dir, "RPG_RT.lmt"), withHeader("LcfMapTree", lmt));
    const db = new Enc().structVecField(0x17, [{ id: 1, body: body(new Enc().strField(0x01, "S1")) }]).intField(0x1a, 2);
    writeFileSync(path.join(dir, "RPG_RT.ldb"), withHeader("LcfDataBase", db));
    const page = new Enc().intField(0x21, 0).commandsField(0x34, [Enc.command(10810, 0, "", [99, 1, 1, 0, 2])]);
    const ev = new Enc().strField(0x01, "E").intField(0x02, 1).intField(0x03, 1).structVecField(0x05, [{ id: 1, body: body(page) }]);
    const map = new Enc().intField(0x01, 1).intField(0x02, 5).intField(0x03, 5).structVecField(0x51, [{ id: 1, body: body(ev) }]);
    writeFileSync(path.join(dir, "Map0001.lmu"), withHeader("LcfMapUnit", map));
    try {
      expect(detectEngine(dir)).toBe("rm2k");
      const r = scan(dir);
      expect(r.counts.error).toBeGreaterThan(0);
      expect(r.html).toContain("rm2k-teleport");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
