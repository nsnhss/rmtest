import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encryptAsset } from "@rmtest/adapter-mv";
import { deployReport } from "../src/deploy.ts";

const FIXTURE_DATA = new URL("../../../packages/adapters/mv/fixtures/mini/data/", import.meta.url);
const ENC_KEY = "d41d8cd98f00b204e9800998ecf8427e"; // fixture System.json 的 encryptionKey

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

/** 构造"部署产物"：资源全部加密并改名 .rpgmvp/.rpgmvo */
function buildDeployedProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-deploy-"));
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
    "audio/bgm/Theme1.ogg": new Uint8Array(32).fill(7),
    "audio/me/Gameover1.ogg": new Uint8Array(32).fill(8),
    "fonts/MyCjkFont.ttf": new Uint8Array([0, 1, 2, 3]),
  };

  for (const [rel, bytes] of Object.entries(assets)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    if (rel.endsWith(".png") || rel.endsWith(".ogg")) {
      // 加密 + 部署扩展名（.rpgmvp / .rpgmvo）
      const encrypted = encryptAsset(bytes, ENC_KEY);
      const ext = rel.endsWith(".png") ? ".png" : ".ogg";
      const deployedExt = rel.endsWith(".png") ? ".rpgmvp" : ".rpgmvo";
      writeFileSync(full.replace(ext, deployedExt), encrypted);
    } else {
      writeFileSync(full, bytes);
    }
  }
  return dir;
}

describe("部署产物验收", () => {
  it("加密部署产物 → 引用全部解析，零悬空错误", () => {
    const dir = buildDeployedProject();
    try {
      const report = deployReport(dir);
      // 加密资源通过 .rpgmvp/.rpgmvo 映射 + 解密全部命中，无缺失
      expect(report.counts.error).toBe(0);
      expect(report.encryptedAssetsDetected).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
