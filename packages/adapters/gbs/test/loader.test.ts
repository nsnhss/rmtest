import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { findProjectFile, loadProject } from "../src/loader.ts";

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `rmtest-gbs-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const PROJECT = {
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
      collisions: "009+",
      actors: [],
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
};

describe("GB Studio 工程加载", () => {
  it("单文件模式：根目录 .gbsproj + 旁侧 assets", () => {
    const dir = tmpDir();
    mkdirSync(path.join(dir, "assets", "sprites"), { recursive: true });
    mkdirSync(path.join(dir, "assets", "backgrounds"), { recursive: true });
    writeFileSync(path.join(dir, "demo.gbsproj"), JSON.stringify(PROJECT));
    writeFileSync(path.join(dir, "assets", "sprites", "player.png"), "png-bytes");
    // bg.png 故意缺失 → 资产检查项
    try {
      expect(findProjectFile(dir)).toBe(path.join(dir, "demo.gbsproj"));
      const p = loadProject(dir);
      expect(p.ir.engine).toBe("gbs");
      expect(p.ir.schemaVersion).toBe(3);
      const t = p.ir.gbs!;
      expect(t.scenes).toHaveLength(1);
      expect(t.startSceneId).toBe("scene-1");
      const sprite = t.assetFiles.find((a) => a.filename.includes("player.png"))!;
      expect(sprite.exists).toBe(true);
      const bg = t.assetFiles.find((a) => a.filename.includes("bg.png"))!;
      expect(bg.exists).toBe(false);
      expect(p.universe.assetFiles.has("assets/sprites/player.png")).toBe(true);
      expect(p.fileHashes.has("demo.gbsproj")).toBe(true);
      expect(p.warnings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("文件夹模式：project.gbsproj", () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, "project.gbsproj"), JSON.stringify(PROJECT));
    try {
      expect(findProjectFile(dir)).toBe(path.join(dir, "project.gbsproj"));
      expect(loadProject(dir).ir.gbs!.scenes).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("大小写不一致 → caseInsensitiveMatch（POSIX）", () => {
    const dir = tmpDir();
    mkdirSync(path.join(dir, "assets", "sprites"), { recursive: true });
    writeFileSync(path.join(dir, "demo.gbsproj"), JSON.stringify(PROJECT));
    writeFileSync(path.join(dir, "assets", "sprites", "PLAYER.png"), "x");
    try {
      const t = loadProject(dir).ir.gbs!;
      const sprite = t.assetFiles.find((a) => a.filename.includes("player.png"))!;
      if (process.platform === "win32") {
        // Windows 文件系统大小写不敏感 → 直接存在
        expect(sprite.exists).toBe(true);
      } else {
        expect(sprite.exists).toBe(false);
        expect(sprite.caseInsensitiveMatch).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("无 .gbsproj → 警告 + 空段", () => {
    const dir = tmpDir();
    mkdirSync(dir, { recursive: true });
    try {
      const p = loadProject(dir);
      expect(p.warnings).toContain("缺少 .gbsproj 工程文件（project.gbsproj 或根目录单个 .gbsproj）");
      expect(p.ir.gbs!.scenes).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("损坏 JSON → 警告不崩", () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, "demo.gbsproj"), "{not json");
    try {
      const p = loadProject(dir);
      expect(p.warnings.some((w) => w.includes("JSON 解析失败"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
