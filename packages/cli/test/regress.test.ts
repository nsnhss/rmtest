import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectStore } from "@rmtest/store";
import { corpusAdd, corpusList } from "../src/corpus.ts";
import { regressCli } from "../src/regress.ts";

const PROJECT = process.env["RM_REAL_PROJECT"];

function buildSceneProject(src: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-regress-"));
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
              { code: 401, indent: 1, parameters: ["你好，回归"] },
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

const PASS_SCENARIO = {
  id: "quest-ok",
  steps: [
    { type: "start_new_game" },
    { type: "walk", to: { map: 2, x: 5, y: 5 } },
    { type: "interact", direction: "up" },
    { type: "assert_switch", switchId: 5, value: true },
  ],
};

const FAIL_SCENARIO = {
  id: "quest-broken-assert",
  steps: [
    { type: "start_new_game" },
    { type: "assert_switch", switchId: 5, value: true }, // 未触发事件 → 失败
  ],
};

const DANGLING_SCENARIO = {
  id: "quest-deleted-map",
  steps: [
    { type: "start_new_game" },
    { type: "walk", to: { map: 99, x: 1, y: 1 } }, // 地图 99 不存在 → broken
  ],
};

describe.skipIf(!PROJECT)("回归闭环（真实引擎）", () => {
  it("corpus add → regress：通过/失败/跳过三态 + 结果入库", { timeout: 300_000 }, async () => {
    const dir = buildSceneProject(PROJECT!);
    const writeScenario = (name: string, data: unknown) =>
      writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data));

    writeScenario("pass", PASS_SCENARIO);
    writeScenario("fail", FAIL_SCENARIO);
    writeScenario("dangling", DANGLING_SCENARIO);
    try {
      expect(corpusAdd(dir, path.join(dir, "pass.json")).steps).toBe(4);
      expect(corpusAdd(dir, path.join(dir, "fail.json")).steps).toBe(2);
      expect(corpusAdd(dir, path.join(dir, "dangling.json")).steps).toBe(2);

      const list = corpusList(dir);
      expect(list).toHaveLength(3);
      expect(list.find((e) => e.id === "quest-deleted-map")!.status).toBe("broken");

      const summary = await regressCli(dir);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.skipped).toBe(1);

      // 结果已入库（历史可查）
      const store = new ProjectStore(path.join(dir, "rmtest.db"));
      const results = store.listResults("quest-ok");
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(true);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
