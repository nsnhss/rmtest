import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encryptAsset } from "../src/decrypt.ts";
import { loadProject } from "../src/loader.ts";
import { makePng } from "./png-helpers.ts";

const FIXTURE_DATA = new URL("../fixtures/mini/data/", import.meta.url);
const ENC_KEY = "d41d8cd98f00b204e9800998ecf8427e";

/** 建一个带资源树的临时工程：数据从 fixture 复制，资源按需生成 */
function buildProject(assets: Record<string, Uint8Array>): { dir: string; destroy: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-load-"));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  for (const name of readdirSync(FIXTURE_DATA)) {
    writeFileSync(path.join(dir, "data", name), readFileSync(new URL(name, FIXTURE_DATA)));
  }
  for (const [rel, bytes] of Object.entries(assets)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, bytes);
  }
  return { dir, destroy: () => rmSync(dir, { recursive: true, force: true }) };
}

function fullAssets(): Record<string, Uint8Array> {
  return {
    "img/characters/Actor1.png": makePng(144, 192),
    "img/characters/Vehicle.png": makePng(144, 192),
    "img/faces/Actor1.png": makePng(144, 144),
    "img/tilesets/Outside_A1.png": makePng(768, 576),
    "img/tilesets/Outside_A2.png": makePng(768, 576),
    "img/tilesets/Outside_A3.png": makePng(768, 576),
    "img/tilesets/Outside_A4.png": makePng(768, 576),
    "img/tilesets/Outside_A5.png": makePng(384, 576),
    "img/tilesets/Outside_B.png": makePng(768, 576),
    "img/tilesets/Outside_C.png": makePng(768, 576),
    "img/tilesets/Outside_D.png": makePng(768, 576),
    "img/tilesets/Outside_E.png": makePng(768, 576),
    "img/enemies/Goblin.png": makePng(288, 288),
    "img/animations/Fire.png": makePng(576, 384),
    "img/titles1/Title1.png": makePng(816, 624),
    "img/system/IconSet.png": makePng(512, 512),
    "audio/bgm/Theme1.ogg": new Uint8Array([1, 2, 3]),
    "audio/me/Gameover1.ogg": new Uint8Array([1, 2, 3]),
  };
}

describe("工程加载器", () => {
  it("构建完整工程：资源入 universe、尺寸入 assets、指纹非空", () => {
    const p = buildProject(fullAssets());
    try {
      const loaded = loadProject(p.dir);
      expect(loaded.universe.assetFiles.has("img/characters/Actor1.png")).toBe(true);
      expect(loaded.universe.assetFiles.has("audio/bgm/Theme1.ogg")).toBe(true);
      const actor1 = loaded.assets.find((a) => a.relPath === "img/characters/Actor1.png")!;
      expect(actor1).toMatchObject({ width: 144, height: 192 });
      expect(loaded.universe.iconCount).toBe(256); // 512/32 * 512/32
      expect(loaded.fingerprint.length).toBeGreaterThan(0);
      expect(loaded.warnings).toEqual([]);
    } finally {
      p.destroy();
    }
  });

  it("缺失资源不入 universe", () => {
    const assets = fullAssets();
    delete assets["img/enemies/Goblin.png"];
    const p = buildProject(assets);
    try {
      const loaded = loadProject(p.dir);
      expect(loaded.universe.assetFiles.has("img/enemies/Goblin.png")).toBe(false);
    } finally {
      p.destroy();
    }
  });

  it("文件变更 → 指纹变化；不变 → 指纹稳定", () => {
    const p = buildProject(fullAssets());
    try {
      const fp1 = loadProject(p.dir).fingerprint;
      const fp2 = loadProject(p.dir).fingerprint;
      expect(fp1).toBe(fp2);
      writeFileSync(path.join(p.dir, "data", "Items.json"), '["改"]');
      const fp3 = loadProject(p.dir).fingerprint;
      expect(fp3).not.toBe(fp1);
    } finally {
      p.destroy();
    }
  });

  it("加密资源(.rpgmvp)解密读尺寸并映射回 .png", () => {
    const assets = fullAssets();
    delete assets["img/faces/Actor1.png"];
    const enc = encryptAsset(makePng(144, 144), ENC_KEY);
    assets["img/faces/Actor1.rpgmvp"] = enc;
    const p = buildProject(assets);
    try {
      const loaded = loadProject(p.dir);
      expect(loaded.universe.assetFiles.has("img/faces/Actor1.png")).toBe(true);
      const face = loaded.assets.find((a) => a.relPath === "img/faces/Actor1.png")!;
      expect(face).toMatchObject({ width: 144, height: 144 });
    } finally {
      p.destroy();
    }
  });

  it("缺 data/ 目录 → 警告而非崩溃", () => {
    const p = buildProject({});
    try {
      const loaded = loadProject(path.join(p.dir, "不存在"));
      expect(loaded.warnings.some((w) => w.includes("data"))).toBe(true);
      expect(loaded.ir.maps).toEqual([]);
    } finally {
      p.destroy();
    }
  });
});
