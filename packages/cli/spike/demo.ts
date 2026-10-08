/**
 * 演示工程构造：生成带埋雷的临时 MV 工程，供 CLI 冒烟测试。
 * 运行：tsx packages/cli/spike/demo.ts [输出目录]（默认系统临时目录）
 */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

const dir = process.argv[2] ? path.resolve(process.argv[2]) : mkdtempSync(path.join(tmpdir(), "rmtest-demo-"));
mkdirSync(path.join(dir, "data"), { recursive: true });
for (const name of readdirSync(FIXTURE_DATA)) {
  writeFileSync(path.join(dir, "data", name), readFileSync(new URL(name, FIXTURE_DATA)));
}

const assets: Record<string, Uint8Array> = {
  // 埋雷 2: 行走图尺寸错误（被角色引用）
  "img/characters/Actor1.png": makePng(100, 200),
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
  "img/animations/Fire.png": makePng(576, 384),
  "img/titles1/Title1.png": makePng(816, 624),
  "img/system/IconSet.png": makePng(512, 512),
  "audio/bgm/Theme1.ogg": new Uint8Array([1]),
  "audio/me/Gameover1.ogg": new Uint8Array([1]),
  // 埋雷 1: 缺 Goblin.png（两个敌人引用）
};
for (const [rel, bytes] of Object.entries(assets)) {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, bytes);
}

// 埋雷 3: 图标索引越界
const items = JSON.parse(readFileSync(path.join(dir, "data", "Items.json"), "utf8"));
items[1]["iconIndex"] = 999;
writeFileSync(path.join(dir, "data", "Items.json"), JSON.stringify(items));

// 埋雷 4: 超长对话
const map1 = JSON.parse(readFileSync(path.join(dir, "data", "Map001.json"), "utf8"));
const list = map1.events[1].pages[0].list;
list.splice(list.length - 1, 0, { code: 101, indent: 0, parameters: ["", 0, 0, 2] });
list.splice(list.length - 1, 0, { code: 401, indent: 1, parameters: ["这一行对话特别特别特别特别特别特别特别特别特别特别特别长肯定溢出了"] });
writeFileSync(path.join(dir, "data", "Map001.json"), JSON.stringify(map1));

console.log(dir);
