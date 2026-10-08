import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encodeMarshal } from "../../adapters/rgss/test/marshal-helpers.ts";
import { scan } from "../src/scan.ts";

const obj = (cls: string, ivars: Record<string, unknown>) => ({ $obj: { cls, ivars } });
const hash = (pairs: Array<[unknown, unknown]>) => ({ $hash: pairs });

function write(dir: string, name: string, value: unknown): void {
  writeFileSync(path.join(dir, "Data", name), Buffer.from(encodeMarshal(value)));
}

function buildRgssProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-rgss-scan-"));
  mkdirSync(path.join(dir, "Data"), { recursive: true });
  mkdirSync(path.join(dir, "Graphics", "Characters"), { recursive: true });

  const system = obj("RPG::System", {
    "@game_title": "RGSS工程",
    "@switches": [null, "任务开关"],
    "@variables": [null, "计数"],
    "@start_map_id": 1,
    "@start_x": 2,
    "@start_y": 2,
  });
  write(dir, "System.rvdata2", system);

  const mapInfo = obj("RPG::MapInfo", { "@name": "MAP001", "@order": 1, "@parent_id": 0 });
  write(dir, "MapInfos.rvdata2", hash([[1, mapInfo]]));

  const condition = obj("RPG::Event::Page::Condition", {
    "@switch1_valid": false, "@switch1_id": 1,
    "@switch2_valid": false, "@switch2_id": 1,
    "@variable_valid": false, "@variable_id": 1,
    "@self_switch_valid": false, "@self_switch_ch": "A",
    "@item_valid": false, "@item_id": 1,
    "@actor_valid": false, "@actor_id": 1,
  });
  const page = obj("RPG::Event::Page", {
    "@condition": condition,
    "@list": [
      obj("RPG::EventCommand", { "@code": 201, "@indent": 0, "@parameters": [0, 99, 1, 1, 0, 0] }), // 埋雷：地图 99 不存在
      obj("RPG::EventCommand", { "@code": 0, "@indent": 0, "@parameters": [] }),
    ],
    "@trigger": 0,
  });
  const event = obj("RPG::Event", { "@id": 1, "@name": "EV001", "@x": 2, "@y": 2, "@pages": [page] });
  const map = obj("RPG::Map", { "@width": 5, "@height": 4, "@tileset_id": 1, "@events": hash([[1, event]]) });
  write(dir, "Map001.rvdata2", map);

  return dir;
}

describe("RGSS 工程静态扫描（端到端）", () => {
  it("自动识别 .rvdata2 工程并报出悬空地图引用", () => {
    const dir = buildRgssProject();
    try {
      const summary = scan(dir);
      expect(summary.counts.error).toBeGreaterThanOrEqual(1);
      expect(summary.html).toContain("地图 99");
      expect(summary.html).toContain("rgss");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
