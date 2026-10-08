import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runScenarioCli } from "../src/run.ts";

const PROJECT = process.env["RM_REAL_PROJECT"];

function buildSceneProject(src: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-cli-run-"));
  cpSync(src, dir, { recursive: true });

  const map2 = {
    autoplayBgm: false, autoplayBgs: false, battleback1Name: "", battleback2Name: "",
    bgm: { name: "", pan: 0, pitch: 100, volume: 90 }, bgs: { name: "", pan: 0, pitch: 100, volume: 90 },
    disableDashing: false, displayName: "", encounterList: [], encounterStep: 30,
    height: 6, note: "", parallaxLoopX: false, parallaxLoopY: false, parallaxName: "",
    parallaxShow: true, parallaxSx: 0, parallaxSy: 0, scrollType: 0, specifyBattleback: false,
    tilesetId: 1, width: 8,
    // tile 10 = 默认图块集里四向可走的真地面（flags 1536 无阻挡位；tile 0 水面、tile 1 墙）
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

describe.skipIf(!PROJECT)("CLI run（真实引擎）", () => {
  it("场景全流程通过：开局 → 走到事件 → 交互 → 断言", { timeout: 180_000 }, async () => {
    const dir = buildSceneProject(PROJECT!);
    const scenarioPath = path.join(dir, "scenario.json");
    writeFileSync(
      scenarioPath,
      JSON.stringify({
        id: "e2e-1",
        steps: [
          { type: "start_new_game" },
          { type: "walk", to: { map: 2, x: 5, y: 5 } },
          { type: "interact", direction: "up" },
          { type: "assert_switch", switchId: 5, value: true },
          { type: "assert_map", map: 2 },
        ],
      }),
    );
    try {
      const result = await runScenarioCli(dir, scenarioPath);
      expect(result.passed).toBe(true);
      expect(result.stepResults.map((s) => s.passed)).toEqual([true, true, true, true, true]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("断言失败 → 失败即停并给出实际值", { timeout: 180_000 }, async () => {
    const dir = buildSceneProject(PROJECT!);
    const scenarioPath = path.join(dir, "scenario.json");
    writeFileSync(
      scenarioPath,
      JSON.stringify({
        id: "e2e-fail",
        steps: [
          { type: "start_new_game" },
          { type: "assert_switch", switchId: 5, value: true }, // 事件未触发 → false
        ],
      }),
    );
    try {
      const result = await runScenarioCli(dir, scenarioPath);
      expect(result.passed).toBe(false);
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[1]!.message).toContain("开关 5");
      expect(result.stepResults[1]!.message).toContain("实际 false");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("对话选项导航：choose 选第二项 → 走对应分支", { timeout: 180_000 }, async () => {
    const dir = buildSceneProject(PROJECT!);
    // 把事件改成带选项：选项A → 开关5，选项B → 开关6
    const map2 = JSON.parse(readFileSync(path.join(dir, "data", "Map002.json"), "utf8"));
    const ev = map2["events"][1];
    ev["pages"][0]["list"] = [
      { code: 102, indent: 0, parameters: [["选项A", "选项B"], 0] },
      { code: 402, indent: 0, parameters: [0] }, // When 选项A（与 102 同级缩进，实证引擎语义）
      { code: 121, indent: 1, parameters: [5, 5, 0] },
      { code: 402, indent: 0, parameters: [1] }, // When 选项B
      { code: 121, indent: 1, parameters: [6, 6, 0] },
      { code: 403, indent: 0, parameters: [] }, // When 取消
      { code: 404, indent: 0, parameters: [] },
      { code: 0, indent: 0, parameters: [] },
    ];
    writeFileSync(path.join(dir, "data", "Map002.json"), JSON.stringify(map2));
    const scenarioPath = path.join(dir, "scenario.json");
    writeFileSync(
      scenarioPath,
      JSON.stringify({
        id: "choice-1",
        steps: [
          { type: "start_new_game" },
          { type: "walk", to: { map: 2, x: 5, y: 5 } },
          { type: "interact", direction: "up" },
          { type: "choose", index: 1 },
          { type: "assert_switch", switchId: 6, value: true },
          { type: "assert_switch", switchId: 5, value: false },
        ],
      }),
    );
    try {
      const result = await runScenarioCli(dir, scenarioPath);
      expect(result.passed).toBe(true);
      expect(result.stepResults.map((s) => s.passed)).toEqual([true, true, true, true, true, true]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("walk 路径模拟：瓦片阻挡 → 路径不可达失败", { timeout: 180_000 }, async () => {
    const dir = buildSceneProject(PROJECT!);
    // 在 y=3 行放满真实水面（tile 0，默认图块集不可走），完全隔开 (2,2) 与 (5,5)
    const map2 = JSON.parse(readFileSync(path.join(dir, "data", "Map002.json"), "utf8"));
    const data = map2["data"];
    for (let x = 0; x <= 7; x++) data[3 * 8 + x] = 0; // 整行水面
    writeFileSync(path.join(dir, "data", "Map002.json"), JSON.stringify(map2));

    const scenarioPath = path.join(dir, "scenario.json");
    writeFileSync(
      scenarioPath,
      JSON.stringify({
        id: "wall-1",
        steps: [
          { type: "start_new_game" },
          { type: "walk", to: { map: 2, x: 5, y: 5 } },
        ],
      }),
    );
    try {
      const result = await runScenarioCli(dir, scenarioPath);
      expect(result.passed).toBe(false);
      expect(result.stepResults[1]!.message).toContain("路径不可达");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
