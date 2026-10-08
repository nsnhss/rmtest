import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeRealGame,
  executeRealScenario,
  gotoMap,
  launchRealGame,
  snapshotReal,
  startRecording,
  waitGameReady,
  type RealGameSession,
} from "../src/index.ts";

const PROJECT = process.env["RM_REAL_PROJECT"];

function buildSceneProject(src: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-record-"));
  cpSync(src, dir, { recursive: true });

  const map2 = {
    autoplayBgm: false, autoplayBgs: false, battleback1Name: "", battleback2Name: "",
    bgm: { name: "", pan: 0, pitch: 100, volume: 90 }, bgs: { name: "", pan: 0, pitch: 100, volume: 90 },
    disableDashing: false, displayName: "", encounterList: [], encounterStep: 30,
    height: 6, note: "", parallaxLoopX: false, parallaxLoopY: false, parallaxName: "",
    parallaxShow: true, parallaxSx: 0, parallaxSy: 0, scrollType: 0, specifyBattleback: false,
    tilesetId: 1, width: 8,
    // tile 10 = 四向可走地面（回放的 walkPathTo 需要真实通行性）
    data: new Array(48).fill(10),
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
              { code: 401, indent: 1, parameters: ["你好，录制"] },
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

describe.skipIf(!PROJECT)("录制器（键盘捕获 → DSL 场景）", () => {
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

  it("录制会话 → 回放验证（录制即场景）", { timeout: 180_000 }, async () => {
    await gotoMap(session.page);

    const recording = await startRecording(session.page, { scenarioId: "rec-1" });

    const key = async (k: string) => {
      await session.page.evaluate((keyName) => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: keyName }));
      }, k);
      await new Promise((r) => setTimeout(r, 120));
    };

    // 从 (2,2) 走到 (5,5)：右×3 下×3
    await key("ArrowRight");
    await key("ArrowRight");
    await key("ArrowRight");
    await key("ArrowDown");
    await key("ArrowDown");
    await key("ArrowDown");
    await key("Enter"); // 触发事件（消息自动确认到结束）

    const scenario = await recording.stop();

    expect(scenario.steps[0]).toEqual({ type: "start_new_game" });
    expect(scenario.steps.some((s) => s.type === "interact")).toBe(true);
    const walk = scenario.steps.find((s) => s.type === "walk");
    expect(walk).toMatchObject({ type: "walk", to: { map: 2, x: 5, y: 5 } });

    // 事件已把开关 5 置位（录制期间真实执行了）
    const snap = await snapshotReal(session.page);
    expect(snap.switches[5]).toBe(true);

    // 回放：重开新游戏 → 加断言 → 跑录制场景 → 通过
    await gotoMap(session.page);
    scenario.steps.push({ type: "assert_switch", switchId: 5, value: true });
    const result = await executeRealScenario(session.page, scenario);
    expect(result.passed).toBe(true);
  });
});
