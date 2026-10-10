/**
 * 性能基准测试 —— 大工程扫描/增量跳过/二进制解析吞吐。
 * 阈值宽松（防环境抖动误报），真实数字打印在输出里供追踪。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Enc, withHeader } from "@rmtest/adapter-rm2k";
import { parseLmu } from "@rmtest/adapter-rm2k";
import { scan } from "../src/scan.ts";

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

/** 合成大型 MV 工程：300 地图 × 10 事件 × 5 命令 + 全套资产 */
function buildLargeMvProject(dir: string): void {
  const MAP_COUNT = 300;
  const EVENT_COUNT = 10;
  const W = 30;
  const H = 30;

  const data = (i: number) => Array.from({ length: W * H }, (_, k) => (k % 7 === i % 7 ? 10 : 11));

  const maps: unknown[] = [];
  for (let i = 1; i <= MAP_COUNT; i++) {
    const events: unknown[] = [];
    for (let e = 1; e <= EVENT_COUNT; e++) {
      events.push({
        id: e,
        name: `EV${i}-${e}`,
        x: e % W,
        y: (e * 3) % H,
        pages: [
          {
            conditions: { switch1Valid: false, switch2Valid: false, variableValid: false, selfSwitchValid: false, itemValid: false, actorValid: false },
            trigger: 0,
            image: { characterName: "", direction: 2, pattern: 0, tileId: 0 },
            list: [
              { code: 101, parameters: ["", 0, 0, 2], indent: 0 },
              { code: 121, parameters: [i % 5 + 1, (i + e) % 5 + 1, 0], indent: 0 },
              { code: 122, parameters: [e % 10 + 1, (e * 2) % 10 + 1, 0, 0, 1], indent: 0 },
              { code: 201, parameters: [1, (i % MAP_COUNT) + 1, e % W, (e * 2) % H, 0, 2], indent: 0 },
              { code: 0, parameters: [], indent: 0 },
            ],
            moveRoute: { list: [{ code: 0, parameters: [] }], repeat: false, skippable: false, wait: false },
            moveType: 0,
            moveSpeed: 3,
            moveFrequency: 3,
            priorityType: 1,
            stepAnime: false,
            walkingAnime: true,
            directionFix: false,
            through: false,
          },
        ],
      });
    }
    maps.push({
      id: i,
      displayName: `Map${String(i).padStart(3, "0")}`,
      width: W,
      height: H,
      tilesetId: 1,
      scrollType: 0,
      autoplayBgm: false,
      autoplayBgs: false,
      bgm: { name: "", volume: 90, pitch: 100, pan: 0 },
      bgs: { name: "", volume: 90, pitch: 100, pan: 0 },
      data: data(i),
      events,
      encounterList: [],
    });
  }

  mkdirSync(path.join(dir, "data"), { recursive: true });
  writeFileSync(path.join(dir, "data", "System.json"), JSON.stringify({
    gameTitle: "perf-demo",
    switches: Array.from({ length: 100 }, (_, i) => `开关${i + 1}`),
    variables: Array.from({ length: 100 }, (_, i) => `变量${i + 1}`),
    startMapId: 1,
    startX: 1,
    startY: 1,
    title1Name: "Title1",
    title2Name: "",
    sounds: [{ name: "Battle1", volume: 90, pitch: 100, pan: 0 }],
    encryptionKey: "",
  }));
  writeFileSync(
    path.join(dir, "data", "MapInfos.json"),
    JSON.stringify(
      maps.map((m, i) => ({
        id: i + 1,
        expanded: true,
        name: `Map${String(i + 1).padStart(3, "0")}`,
        order: i + 1,
        parentId: 0,
        scrollX: 0,
        scrollY: 0,
      })),
    ),
  );
  for (const m of maps) {
    const id = (m as { id: number }).id;
    writeFileSync(path.join(dir, "data", `Map${String(id).padStart(3, "0")}.json`), JSON.stringify(m));
  }
  writeFileSync(path.join(dir, "data", "Tilesets.json"), JSON.stringify([
    null,
    { id: 1, name: "Outside", mode: 0, tilesetNames: ["A1", "A2", "A3", "A4", "A5", "B", "C", "D", "E"], flags: new Array(8192).fill(0) },
  ]));
  writeFileSync(path.join(dir, "data", "CommonEvents.json"), JSON.stringify([]));

  // 资产
  const assetDirs = ["img/characters", "img/tilesets", "img/enemies", "img/system", "img/titles1", "audio/bgm"];
  for (const d of assetDirs) mkdirSync(path.join(dir, d), { recursive: true });
  const assets: Record<string, Uint8Array> = {
    "img/characters/Actor1.png": makePng(144, 192),
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
    "img/system/IconSet.png": makePng(512, 512),
    "img/titles1/Title1.png": makePng(816, 624),
    "audio/bgm/Theme1.ogg": new Uint8Array([1]),
  };
  for (const [rel, content] of Object.entries(assets)) {
    writeFileSync(path.join(dir, rel), content);
  }
}

/** 合成大型 RM2k 地图：100 事件 × 5 页 × 10 命令 */
function buildLargeLmu(): Uint8Array {
  const body = (e: Enc): number[] => Array.from(e.out);
  const pages: Array<{ id: number; body: number[] }> = [];
  for (let p = 1; p <= 5; p++) {
    const cmds: number[][] = [];
    for (let c = 0; c < 10; c++) {
      cmds.push(Enc.command(10110, c % 4, `message ${c}`, [c, c + 1]));
    }
    pages.push({ id: p, body: body(new Enc().intField(0x21, 0).commandsField(0x34, cmds)) });
  }
  const events: Array<{ id: number; body: number[] }> = [];
  for (let e = 1; e <= 100; e++) {
    events.push({
      id: e,
      body: body(new Enc().strField(0x01, `E${e}`).intField(0x02, e % 50).intField(0x03, (e * 7) % 50).structVecField(0x05, pages)),
    });
  }
  const map = new Enc().intField(0x01, 1).intField(0x02, 100).intField(0x03, 100).structVecField(0x51, events);
  return withHeader("LcfMapUnit", map);
}

describe("性能基准", () => {
  it("300 地图 × 10 事件工程：全量扫描", { timeout: 120_000 }, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rmtest-perf-"));
    try {
      buildLargeMvProject(dir);
      const rssBefore = process.memoryUsage().rss;
      const t0 = Date.now();
      const r = scan(dir);
      const elapsed = Date.now() - t0;
      const rssDelta = process.memoryUsage().rss - rssBefore;
      console.log(`[perf] MV 300 地图扫描: ${elapsed}ms, RSS 增量 ${(rssDelta / 1024 / 1024).toFixed(1)}MB, 错误 ${r.counts.error}`);
      expect(elapsed).toBeLessThan(60_000);
      expect(rssDelta).toBeLessThan(1024 * 1024 * 1024); // < 1GB
      expect(r.html.length).toBeGreaterThan(0);

      // 增量：首次建立基线 → 第二次无变更 → 秒级跳过
      scan(dir, { incremental: true });
      const t1 = Date.now();
      const inc = scan(dir, { incremental: true });
      const incElapsed = Date.now() - t1;
      console.log(`[perf] 增量无变更: ${incElapsed}ms, unchanged=${inc.unchanged}`);
      expect(inc.unchanged).toBe(true);
      expect(incElapsed).toBeLessThan(10_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("RM2k 100×100 地图（100 事件 × 5 页 × 10 命令）解析", { timeout: 60_000 }, () => {
    const lmu = buildLargeLmu();
    const t0 = Date.now();
    const parsed = parseLmu(lmu);
    const elapsed = Date.now() - t0;
    console.log(`[perf] RM2k 大地图解析: ${elapsed}ms, 事件 ${parsed.events.length}, 命令 ${parsed.events.reduce((n, e) => n + e.pages.reduce((m, p) => m + p.commands.length, 0), 0)}`);
    expect(elapsed).toBeLessThan(10_000);
    expect(parsed.events).toHaveLength(100);
    expect(parsed.events[0]!.pages[0]!.commands).toHaveLength(10);
  });
});
