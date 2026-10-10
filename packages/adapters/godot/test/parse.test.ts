import { describe, expect, it } from "vitest";
import { extractFuncs, extractNodePaths, normalizePath, parseProjectConfig, parseTextResource } from "../src/parse.ts";

describe("project.godot 解析", () => {
  it("主场景与 autoload", () => {
    const cfg = parseProjectConfig(`
; Engine configuration file.
config_version=5

[application]

config/name="我的游戏"
run/main_scene="res://scenes/main.tscn"

[autoload]

SaveSystem="*res://autoload/save.gd"
DebugDraw="res://autoload/debug.gd"

[display]
`);
    expect(cfg.mainScene).toBe("res://scenes/main.tscn");
    expect(cfg.autoloads).toEqual([
      { name: "SaveSystem", path: "res://autoload/save.gd" },
      { name: "DebugDraw", path: "res://autoload/debug.gd" },
    ]);
  });

  it("缺主场景 → null", () => {
    expect(parseProjectConfig("[application]\nconfig/name=\"x\"\n").mainScene).toBeNull();
  });
});

describe("场景文本解析", () => {
  const SCENE = `[gd_scene load_steps=3 format=3 uid="uid://scene1"]

[ext_resource type="Script" path="res://scripts/player.gd" id="1_abc"]
[ext_resource type="Texture2D" uid="uid://tex1" path="res://sprites/hero.png" id="2_def"]

[node name="Main" type="Node2D"]

[node name="Player" type="CharacterBody2D" parent="."]
script = ExtResource("1_abc")

[node name="Enemy" parent="." instance=ExtResource("3_gh")]

[connection signal="body_entered" from="Player" to="Player" method="_on_body_entered"]
`;

  it("ext_resource/节点/连接/脚本", () => {
    const r = parseTextResource("scenes/main.tscn", SCENE);
    expect(r.uid).toBe("uid://scene1");
    expect(r.extResources).toHaveLength(2);
    expect(r.extResources[0]).toEqual({ id: "1_abc", type: "Script", path: "scripts/player.gd", uid: null });
    expect(r.extResources[1]).toEqual({ id: "2_def", type: "Texture2D", path: "sprites/hero.png", uid: "uid://tex1" });
    expect(r.nodes).toHaveLength(3);
    expect(r.nodes[1]).toMatchObject({ path: "Player", name: "Player", type: "CharacterBody2D", instanceRefId: null });
    expect(r.nodes[1]!.scriptRef).toEqual({ id: "1_abc", type: "Script", path: "scripts/player.gd", uid: null });
    expect(r.nodes[2]!.instanceRefId).toBe("3_gh");
    expect(r.connections).toEqual([{ signal: "body_entered", from: "Player", to: "Player", method: "_on_body_entered" }]);
  });

  it("相对路径 ext_resource 归一化到文件目录", () => {
    const r = parseTextResource("levels/deep/level.tscn", '[ext_resource type="PackedScene" path="../shared/room.tscn" id="1_x"]\n');
    expect(r.extResources[0]!.path).toBe("levels/shared/room.tscn");
  });
});

describe("路径归一化", () => {
  it("res:// 与相对与 ..", () => {
    expect(normalizePath("res://a/b.tscn", "x")).toBe("a/b.tscn");
    expect(normalizePath("c.tscn", "scenes")).toBe("scenes/c.tscn");
    expect(normalizePath("../up.tscn", "scenes/sub")).toBe("scenes/up.tscn");
    expect(normalizePath("uid://abc", "")).toBeNull();
  });
});

describe(".gd 提取", () => {
  it("函数清单（含 static 与换行前签名）", () => {
    const funcs = extractFuncs(`
extends CharacterBody2D

func _on_body_entered(body: Node2D) -> void:
    pass

static func helper(x: int) -> int:
    return x

signal died
`);
    expect(funcs).toEqual(["_on_body_entered", "helper"]);
  });

  it("节点路径字面量", () => {
    const paths = extractNodePaths(`
@onready var label = $UI/Score/Label
func x():
    get_node("../Enemy").queue_free()
    get_node(^"Main").print_tree()
    var y = $"Anim/Player"
    var z = get_node("/root/Game")  # 引擎绝对路径跳过
    var w = $%Unique                # 唯一名跳过
`);
    expect(paths).toEqual(["../Enemy", "^Main", "Anim/Player", "UI/Score/Label"]);
  });
});
