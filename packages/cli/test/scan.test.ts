import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scan } from "../src/scan.ts";

const FIXTURE_DATA = new URL("../../../packages/adapters/mv/fixtures/mini/data/", import.meta.url);

function makePng(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  b[16] = (width >>> 24) & 0xff;
  b[17] = (width >>> 16) & 0xff;
  b[18] = (width >>> 8) & 0xff;
  b[19] = width & 0xff;
  b[20] = (height >>> 24) & 0xff;
  b[21] = (height >>> 16) & 0xff;
  b[22] = (height >>> 8) & 0xff;
  b[23] = height & 0xff;
  b.set([8, 6, 0, 0, 0], 24);
  return b;
}

function buildDemo(planted: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-cli-"));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  for (const name of readdirSync(FIXTURE_DATA)) {
    writeFileSync(path.join(dir, "data", name), readFileSync(new URL(name, FIXTURE_DATA)));
  }
  const assets: Record<string, Uint8Array> = {
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
    "audio/bgm/Theme1.ogg": new Uint8Array([1]),
    "audio/me/Gameover1.ogg": new Uint8Array([1]),
    "fonts/MyCjkFont.ttf": new Uint8Array([0, 1, 2, 3]),
  };
  if (planted) delete assets["img/enemies/Goblin.png"];
  for (const [rel, bytes] of Object.entries(assets)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, bytes);
  }
  if (planted) {
    const items = JSON.parse(readFileSync(path.join(dir, "data", "Items.json"), "utf8"));
    items[1]["iconIndex"] = 999;
    writeFileSync(path.join(dir, "data", "Items.json"), JSON.stringify(items));
  }
  return dir;
}

describe("扫描管线端到端", () => {
  it("合法工程 → 零发现", () => {
    const dir = buildDemo(false);
    try {
      const summary = scan(dir);
      expect(summary.counts).toEqual({ error: 0, warning: 0, info: 0 });
      expect(summary.html).toContain("未发现问题");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("埋雷工程 → 报出缺失资源与图标越界", () => {
    const dir = buildDemo(true);
    try {
      const summary = scan(dir);
      expect(summary.counts.error).toBeGreaterThanOrEqual(2);
      expect(summary.html).toContain("Goblin.png");
      expect(summary.html).toContain("999");
      expect(summary.html).toContain("img/enemies/Goblin.png");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("增量扫描：基线 → 变更检测 → 无变更跳过", () => {
    const dir = buildDemo(false);
    try {
      // 首次增量：无基线 → changedFiles 为 null
      const first = scan(dir, { incremental: true });
      expect(first.changedFiles).toBeNull();
      expect(first.unchanged).toBe(false);

      // 无变更 → 跳过重扫
      const second = scan(dir, { incremental: true });
      expect(second.unchanged).toBe(true);
      expect(second.counts).toEqual({ error: 0, warning: 0, info: 0 });

      // 改一个文件 → 报出该文件
      writeFileSync(path.join(dir, "data", "Items.json"), '["改"]');
      const third = scan(dir, { incremental: true });
      expect(third.unchanged).toBe(false);
      expect(third.changedFiles).toContain("data/Items.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
