import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentReport } from "../src/content.ts";

const FIXTURE_DATA = new URL("../../../packages/adapters/mv/fixtures/mini/data/", import.meta.url);

function buildProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-content-"));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  for (const name of readdirSync(FIXTURE_DATA)) {
    writeFileSync(path.join(dir, "data", name), readFileSync(new URL(name, FIXTURE_DATA)));
  }
  return dir;
}

describe("content 命令", () => {
  it("首次运行：无基线，报出可达全集（fixture: 2 个事件页）", () => {
    const dir = buildProject();
    try {
      const report = contentReport(dir);
      expect(report.hasBaseline).toBe(false);
      expect(report.total).toBe(2);
      expect(report.keys).toEqual(["1:1:0", "1:2:0"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("有基线：新增与删除分开报", () => {
    const dir = buildProject();
    try {
      const report = contentReport(dir, ["1:1:0", "1:2:0", "9:9:0"]);
      expect(report.hasBaseline).toBe(true);
      expect(report.added).toEqual([]);
      expect(report.removed).toEqual(["9:9:0"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("工程加了新事件页 → 出现在新增列表", () => {
    const dir = buildProject();
    try {
      // 给 Map002 加一个事件页 → 新的可达 key 2:1:0
      const map2 = JSON.parse(readFileSync(path.join(dir, "data", "Map002.json"), "utf8"));
      map2["events"] = [
        null,
        {
          id: 1,
          name: "NEW",
          note: "",
          pages: [
            {
              conditions: { actorId: 1, actorValid: false, itemId: 1, itemValid: false, selfSwitchCh: "A", selfSwitchValid: false, switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false, variableId: 1, variableValid: false, variableValue: 0 },
              directionFix: false,
              image: { characterIndex: 0, characterName: "", direction: 2, pattern: 0, tileId: 0 },
              list: [{ code: 0, indent: 0, parameters: [] }],
              moveFrequency: 3,
              moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
              moveSpeed: 3,
              moveType: 0,
              priorityType: 0,
              stepAnime: false,
              through: false,
              trigger: 0,
              walkAnime: true,
            },
          ],
          x: 1,
          y: 1,
        },
      ];
      writeFileSync(path.join(dir, "data", "Map002.json"), JSON.stringify(map2));

      const report = contentReport(dir, ["1:1:0", "1:2:0"]);
      expect(report.added).toEqual(["2:1:0"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
