import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeRealGame,
  gotoMap,
  launchRealGame,
  loadGame,
  pressOk,
  runRealEvent,
  saveGame,
  snapshotReal,
  triggerAt,
  waitGameReady,
  waitForSnapshot,
  enterMapScene,
  type RealGameSession,
} from "../src/index.ts";

// 真实引擎文件（rpg_*.js）是 KADOKAWA 版权物，不进仓库。
// 测试需要 RM_REAL_PROJECT 指向本机 MV/MZ 工程；未设置时整组跳过。
// 测试在工程副本上注入测试地图，不动原工程。
const PROJECT = process.env["RM_REAL_PROJECT"];

function buildSceneProject(src: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-scene-"));
  cpSync(src, dir, { recursive: true });

  // 测试地图：8×6，事件 (5,5) 有对话 + 开开关 5
  const map2 = {
    autoplayBgm: false, autoplayBgs: false, battleback1Name: "", battleback2Name: "",
    bgm: { name: "", pan: 0, pitch: 100, volume: 90 }, bgs: { name: "", pan: 0, pitch: 100, volume: 90 },
    disableDashing: false, displayName: "", encounterList: [], encounterStep: 30,
    height: 6, note: "", parallaxLoopX: false, parallaxLoopY: false, parallaxName: "",
    parallaxShow: true, parallaxSx: 0, parallaxSy: 0, scrollType: 0, specifyBattleback: false,
    tilesetId: 1, width: 8,
    data: new Array(48).fill(0),
    events: [
      null,
      {
        id: 1, name: "EV001", note: "", x: 5, y: 5,
        pages: [
          {
            conditions: { actorId: 1, actorValid: false, itemId: 1, itemValid: false, selfSwitchCh: "A", selfSwitchValid: false, switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false, variableId: 1, variableValid: false, variableValue: 0 },
            directionFix: false,
            image: { characterIndex: 0, characterName: "", direction: 2, pattern: 0, tileId: 0 },
            list: [
              { code: 101, indent: 0, parameters: ["", 0, 0, 2] },
              { code: 401, indent: 1, parameters: ["你好，真实引擎"] },
              { code: 121, indent: 0, parameters: [5, 5, 0] },
              { code: 0, indent: 0, parameters: [] },
            ],
            moveFrequency: 3, moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
            moveSpeed: 3, moveType: 0, priorityType: 1, stepAnime: false, through: false, trigger: 0, walkAnime: true,
          },
        ],
      },
    ],
  };
  writeFileSync(path.join(dir, "data", "Map002.json"), JSON.stringify(map2));

  const infos = JSON.parse(readFileSync(path.join(dir, "data", "MapInfos.json"), "utf8"));
  infos.push({ id: 2, expanded: true, name: "MAP002", order: 2, parentId: 0, scrollX: 800, scrollY: 400 });
  writeFileSync(path.join(dir, "data", "MapInfos.json"), JSON.stringify(infos));

  const system = JSON.parse(readFileSync(path.join(dir, "data", "System.json"), "utf8"));
  system["startMapId"] = 2;
  system["startX"] = 2;
  system["startY"] = 2;
  writeFileSync(path.join(dir, "data", "System.json"), JSON.stringify(system));

  return dir;
}

describe.skipIf(!PROJECT)("真实引擎场景级", () => {
  let session: RealGameSession;
  let projectDir: string;
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");

  beforeAll(async () => {
    projectDir = buildSceneProject(PROJECT!);
    session = await launchRealGame(projectDir, { electronPath: electronExe });
    await waitGameReady(session.page);
  }, 120_000);

  afterAll(async () => {
    await closeRealGame(session);
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("进入地图场景：开局在地图 2", { timeout: 90_000 }, async () => {
    const ok = await gotoMap(session.page);
    expect(ok).toBe(true);
    const snap = await snapshotReal(session.page);
    expect(snap.mapId).toBe(2);
    expect(snap.eventRunning).toBe(false);
  });

  it("触发对话事件：消息等待 → 确认 → 事件完成并置开关", { timeout: 90_000 }, async () => {
    await triggerAt(session.page, 5, 5);
    // 事件开始运行，消息窗口出现（真实帧循环驱动）
    const busy = await waitForSnapshot(session.page, (s) => s.eventRunning && s.messageBusy, 15_000);
    expect(busy.eventRunning).toBe(true);

    await pressOk(session.page);
    // 消息确认后事件走完，开关 5 置位
    const done = await waitForSnapshot(session.page, (s) => !s.eventRunning && !s.messageBusy, 15_000);
    expect(done.switches[5]).toBe(true);
  });

  it("存档往返：保存 → 改状态 → 读档恢复", { timeout: 90_000 }, async () => {
    // 当前开关 5 = ON，存到槽位 1
    const saved = await saveGame(session.page, 1);
    expect(saved).toBe(true);

    // 手动把开关 5 关掉
    await runRealEvent(session.page, [
      { code: 121, indent: 0, parameters: [5, 5, 1] },
      { code: 0, indent: 0, parameters: [] },
    ]);
    const off = await snapshotReal(session.page);
    expect(off.switches[5]).toBe(false);

    // 读档 → 回地图场景 → 开关 5 恢复 ON
    const loaded = await loadGame(session.page, 1);
    expect(loaded).toBe(true);
    const entered = await enterMapScene(session.page);
    expect(entered).toBe(true);
    const restored = await waitForSnapshot(session.page, (s) => !s.transferring, 15_000);
    expect(restored.switches[5]).toBe(true);
    expect(restored.mapId).toBe(2);
  });
});
