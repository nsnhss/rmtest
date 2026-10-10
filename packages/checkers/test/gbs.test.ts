/**
 * GB Studio 检查器集成测试 —— 加载器 → 检查器全链路。
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildLifecycle, buildRefGraph, runCheckers, type CheckRunResult } from "@rmtest/core";
import { loadProject, type LoadedProject } from "@rmtest/adapter-gbs";
import { checkers } from "../src/index.ts";

function buildProject(dir: string, project: unknown, files: Record<string, string> = {}): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "demo.gbsproj"), JSON.stringify(project));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
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

const baseProject = () => ({
  _version: "4.2.0",
  name: "demo",
  settings: { startSceneId: "scene-1", startX: 0, startY: 0 },
  scenes: [
    {
      id: "scene-1",
      name: "S1",
      type: "TOPDOWN",
      width: 3,
      height: 3,
      backgroundId: "bg-1",
      tilesetId: "",
      paletteIds: [],
      spritePaletteIds: [],
      collisions: "009+", // 3×3 全空
      actors: [
        { id: "a1", name: "村长", x: 1, y: 1, spriteSheetId: "sprite-1", paletteId: "", script: [] },
      ],
      triggers: [],
      script: [],
    },
  ],
  customEvents: [],
  spriteSheets: [{ id: "sprite-1", name: "player", filename: "assets/sprites/player.png" }],
  backgrounds: [{ id: "bg-1", name: "bg", filename: "assets/backgrounds/bg.png" }],
  tilesets: [],
  sounds: [],
  music: [],
  emotes: [],
  avatars: [],
  fonts: [],
  palettes: [],
});

describe("GB Studio 检查器", () => {
  it("合法工程 → 零 GB Studio 报告", () => {
    const dir = path.join(os.tmpdir(), `rmtest-gbs-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
    buildProject(dir, baseProject(), {
      "assets/sprites/player.png": "x",
      "assets/backgrounds/bg.png": "x",
    });
    try {
      const result = run(dir);
      expect(result.errors).toEqual([]);
      expect(result.sections.filter((s) => s.type.startsWith("gbs-"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("断链引用全集：场景/行走图/音乐/音效/演员/背景/调色板/标签", () => {
    const p = baseProject();
    const scene = (p as never as { scenes: Array<Record<string, unknown>> }).scenes[0]!;
    scene["backgroundId"] = "bg-gone";
    scene["paletteIds"] = ["pal-gone"];
    const actor = (scene["actors"] as Array<Record<string, unknown>>)[0]!;
    actor["spriteSheetId"] = "sprite-gone";
    actor["script"] = [
      { command: "EVENT_MUSIC_PLAY", args: { musicId: "music-gone" } },
      { command: "EVENT_SOUND_PLAY_EFFECT", args: { type: "sound-gone" } },
      { command: "EVENT_ACTOR_SET_SPRITE", args: { actorId: "ghost", spriteSheetId: "sprite-1" } },
      { command: "EVENT_GOTO_LABEL", args: { label: "nowhere" } },
    ];
    scene["script"] = [{ command: "EVENT_SWITCH_SCENE", args: { sceneId: "scene-gone", x: 0, y: 0 } }];

    const dir = path.join(os.tmpdir(), `rmtest-gbs-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
    buildProject(dir, p);
    try {
      const sections = run(dir).sections.filter((s) => s.type.startsWith("gbs-"));
      const broken = sections.filter((s) => s.type === "gbs-broken-ref");
      expect(broken).toHaveLength(7);
      expect(broken.some((s) => s.message.includes("背景 bg-gone"))).toBe(true);
      expect(broken.some((s) => s.message.includes("场景 scene-gone"))).toBe(true);
      expect(broken.some((s) => s.message.includes("行走图 sprite-gone"))).toBe(true);
      expect(broken.some((s) => s.message.includes("音乐 music-gone"))).toBe(true);
      expect(broken.some((s) => s.message.includes("音效 sound-gone"))).toBe(true);
      expect(broken.some((s) => s.message.includes("演员 ghost"))).toBe(true);
      expect(broken.some((s) => s.message.includes("调色板 pal-gone"))).toBe(true);

      const label = sections.filter((s) => s.type === "gbs-label-missing");
      expect(label).toHaveLength(1);
      expect(label[0]!.message).toContain("nowhere");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("软锁：起始实心", () => {
    const p = baseProject();
    const scene = (p as { scenes: Array<Record<string, unknown>> }).scenes[0]!;
    scene["collisions"] = "008+01!"; // (2,2) 实心
    (p as { settings: Record<string, unknown> }).settings["startX"] = 2;
    (p as { settings: Record<string, unknown> }).settings["startY"] = 2;

    const dir = path.join(os.tmpdir(), `rmtest-gbs-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
    buildProject(dir, p);
    try {
      const sections = run(dir).sections.filter((s) => s.type === "gbs-collision-softlock");
      expect(sections.some((s) => s.message.includes("起始位置"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("软锁：传送实心 + 演员出生实心 + 不可达触发器（TOPDOWN BFS）", () => {
    const p = baseProject();
    // 3×3：右下角 (2,2) 实心；起始 (0,0) 可走
    const scene = (p as { scenes: Array<Record<string, unknown>> }).scenes[0]!;
    scene["collisions"] = "008+01!";
    scene["script"] = [{ command: "EVENT_SWITCH_SCENE", args: { sceneId: "scene-1", x: { type: "number", value: 2 }, y: { type: "number", value: 2 } } }];
    (scene["actors"] as Array<Record<string, unknown>>)[0]!["x"] = 2;
    (scene["actors"] as Array<Record<string, unknown>>)[0]!["y"] = 2;
    scene["triggers"] = [{ id: "t1", name: "孤岛", x: 2, y: 2, width: 1, height: 1, script: [] }];

    const dir = path.join(os.tmpdir(), `rmtest-gbs-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
    buildProject(dir, p);
    try {
      const sections = run(dir).sections.filter((s) => s.type === "gbs-collision-softlock");
      expect(sections.some((s) => s.message.includes("传送到场景"))).toBe(true);
      expect(sections.some((s) => s.message.includes("村长"))).toBe(true);
      expect(sections.some((s) => s.severity === "info" && s.message.includes("孤岛"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("起始场景缺失 + 资产文件缺失（含大小写降级）", () => {
    const p = baseProject();
    (p as { settings: Record<string, unknown> }).settings["startSceneId"] = "nope";
    const dir = path.join(os.tmpdir(), `rmtest-gbs-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
    buildProject(dir, p, {
      // player.png 缺失；bg.png 以错误大小写存在
      "assets/backgrounds/BG.PNG": "x",
    });
    try {
      const sections = run(dir).sections;
      const start = sections.filter((s) => s.type === "gbs-start-scene");
      expect(start).toHaveLength(1);
      const missing = sections.filter((s) => s.type === "gbs-missing-asset");
      expect(missing.some((s) => s.severity === "error" && s.message.includes("player.png"))).toBe(true);
      if (process.platform !== "win32") {
        expect(missing.some((s) => s.severity === "warning" && s.message.includes("bg.png"))).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
