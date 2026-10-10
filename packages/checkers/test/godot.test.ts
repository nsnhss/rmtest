/**
 * Godot 检查器集成测试 —— 加载器 → 检查器全链路。
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildLifecycle, buildRefGraph, runCheckers, type CheckRunResult } from "@rmtest/core";
import { loadProject, type LoadedProject } from "@rmtest/adapter-godot";
import { checkers } from "../src/index.ts";

function buildProject(files: Record<string, string>): string {
  const dir = path.join(os.tmpdir(), `rmtest-godot-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
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

describe("Godot 检查器", () => {
  it("合法工程 → 零 Godot 报告", () => {
    const dir = buildProject({
      "project.godot": '[application]\nrun/main_scene="res://scenes/main.tscn"\n',
      "scenes/main.tscn": [
        '[gd_scene format=3 uid="uid://main"]',
        '[ext_resource type="Script" path="res://scripts/main.gd" id="1_a"]',
        '[ext_resource type="Texture2D" path="res://sprites/hero.png" id="2_b"]',
        '[node name="Main" type="Node2D"]',
        'script = ExtResource("1_a")',
        '[node name="Sprite" type="Sprite2D" parent="."]',
        'texture = ExtResource("2_b")',
      ].join("\n"),
      "scripts/main.gd": "extends Node2D\n\nfunc _on_ready():\n\tpass\n",
      "sprites/hero.png": "x",
    });
    try {
      const result = run(dir);
      expect(result.errors).toEqual([]);
      expect(result.sections.filter((s) => s.type.startsWith("godot-"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("缺失资源 + 大小写 + 主场景缺失 + autoload 缺失", () => {
    const dir = buildProject({
      "project.godot": '[application]\nrun/main_scene="res://scenes/gone.tscn"\n[autoload]\nSave="*res://autoload/gone.gd"\n',
      "scenes/main.tscn": [
        '[gd_scene format=3]',
        '[ext_resource type="Script" path="res://scripts/missing.gd" id="1_a"]',
        '[ext_resource type="Texture2D" path="res://sprites/hero.png" id="2_b"]',
        '[node name="Main" type="Node2D"]',
        'script = ExtResource("1_a")',
        '[node name="Sprite" type="Sprite2D" parent="."]',
        'texture = ExtResource("2_b")',
      ].join("\n"),
      "sprites/HERO.png": "x", // 大小写不一致
    });
    try {
      const sections = run(dir).sections.filter((s) => s.type === "godot-missing-resource");
      expect(sections.some((s) => s.severity === "error" && s.message.includes("scripts/missing.gd"))).toBe(true);
      expect(sections.some((s) => s.severity === "error" && s.message.includes("scenes/gone.tscn"))).toBe(true);
      expect(sections.some((s) => s.message.includes("autoload/gone.gd"))).toBe(true);
      expect(sections.some((s) => s.severity === "warning" && s.message.includes("sprites/hero.png"))).toBe(true);

      const cfg = run(dir).sections.filter((s) => s.type === "godot-project-config");
      expect(cfg.some((s) => s.message.includes("主场景"))).toBe(true);
      expect(cfg.some((s) => s.message.includes("autoload Save"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("场景实例环 → 死循环报告", () => {
    const dir = buildProject({
      "project.godot": '[application]\nrun/main_scene="res://a.tscn"\n',
      "a.tscn": [
        '[gd_scene format=3]',
        '[ext_resource type="PackedScene" path="res://b.tscn" id="1_b"]',
        '[node name="A" type="Node2D"]',
        '[node name="B" parent="." instance=ExtResource("1_b")]',
      ].join("\n"),
      "b.tscn": [
        '[gd_scene format=3]',
        '[ext_resource type="PackedScene" path="res://a.tscn" id="1_a"]',
        '[node name="B" type="Node2D"]',
        '[node name="A" parent="." instance=ExtResource("1_a")]',
      ].join("\n"),
    });
    try {
      const sections = run(dir).sections.filter((s) => s.type === "godot-scene-cycle");
      expect(sections).toHaveLength(1);
      expect(sections[0]!.message).toContain("a.tscn");
      expect(sections[0]!.message).toContain("b.tscn");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("连接处理函数缺失（warning）+ 节点路径断链", () => {
    const dir = buildProject({
      "project.godot": '[application]\nrun/main_scene="res://scenes/main.tscn"\n',
      "scenes/main.tscn": [
        '[gd_scene format=3]',
        '[ext_resource type="Script" path="res://scripts/main.gd" id="1_a"]',
        '[node name="Main" type="Node2D"]',
        'script = ExtResource("1_a")',
        '[node name="UI" type="Control" parent="."]',
        '[node name="Label" type="Label" parent="UI"]',
        '[connection signal="pressed" from="UI" to="." method="_on_button_pressed"]',
      ].join("\n"),
      "scripts/main.gd": [
        "extends Node2D",
        "",
        "func _ready():",
        "\tget_node(\"UI/Label\").text = \"x\"",
        "\tget_node(\"UI/Gone\").queue_free()",
        "",
      ].join("\n"),
    });
    try {
      const sections = run(dir).sections;

      const conn = sections.filter((s) => s.type === "godot-connection-method");
      expect(conn).toHaveLength(1);
      expect(conn[0]!.message).toContain("_on_button_pressed");

      const paths = sections.filter((s) => s.type === "godot-node-path");
      expect(paths).toHaveLength(1);
      expect(paths[0]!.message).toContain("UI/Gone");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("未设置主场景 → 无法启动报告", () => {
    const dir = buildProject({
      "project.godot": '[application]\nconfig/name="x"\n',
    });
    try {
      const sections = run(dir).sections.filter((s) => s.type === "godot-project-config");
      expect(sections).toHaveLength(1);
      expect(sections[0]!.message).toContain("未设置主场景");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
