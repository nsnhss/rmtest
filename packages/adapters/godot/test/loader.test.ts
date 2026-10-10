import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadProject } from "../src/loader.ts";

function buildProject(files: Record<string, string>): string {
  const dir = path.join(os.tmpdir(), `rmtest-godot-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe("Godot 工程加载", () => {
  it("完整工程 → IR 段/文件清单/uid 映射/函数清单", () => {
    const dir = buildProject({
      "project.godot": '[application]\nrun/main_scene="res://scenes/main.tscn"\n[autoload]\nSave="*res://autoload/save.gd"\n',
      "scenes/main.tscn": [
        '[gd_scene format=3 uid="uid://main"]',
        '[ext_resource type="Script" path="res://scripts/main.gd" id="1_a"]',
        '[node name="Main" type="Node2D"]',
        'script = ExtResource("1_a")',
      ].join("\n"),
      "scripts/main.gd": 'extends Node2D\n\nfunc _on_pressed():\n\tpass\n',
      "autoload/save.gd": "extends Node\n",
      "sprites/hero.png": "png-bytes",
      ".godot/editor/cache.bin": "ignored",
      "sprites/hero.png.import": "import-meta",
    });
    try {
      const p = loadProject(dir);
      expect(p.ir.engine).toBe("godot");
      expect(p.ir.schemaVersion).toBe(4);
      const t = p.ir.godot!;
      expect(t.mainScene).toBe("scenes/main.tscn");
      expect(t.autoloads).toEqual([{ name: "Save", path: "autoload/save.gd" }]);
      expect(t.scenes).toHaveLength(1);
      expect(t.uidToPath["uid://main"]).toBe("scenes/main.tscn");
      expect(t.scriptFuncs["scripts/main.gd"]).toEqual(["_on_pressed"]);
      // .godot/ 与 *.import 不进清单
      expect(t.files).not.toContain(".godot/editor/cache.bin");
      expect(t.files).not.toContain("sprites/hero.png.import");
      expect(t.files).toContain("sprites/hero.png");
      expect(p.fingerprint).toHaveLength(16);
      expect(p.warnings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uid 主场景 → 解析为路径", () => {
    const dir = buildProject({
      "project.godot": '[application]\nrun/main_scene="uid://main"\n',
      "scenes/main.tscn": '[gd_scene format=3 uid="uid://main"]\n[node name="Main" type="Node2D"]\n',
    });
    try {
      expect(loadProject(dir).ir.godot!.mainScene).toBe("scenes/main.tscn");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("缺 project.godot → 警告", () => {
    const dir = buildProject({ "scenes/x.tscn": '[gd_scene format=3]\n' });
    try {
      expect(loadProject(dir).warnings).toContain("缺少 project.godot（Godot 工程入口）");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
