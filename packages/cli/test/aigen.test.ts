import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MockProvider } from "@rmtest/ai";
import { aigen } from "../src/aigen.ts";

const FIXTURE_DATA = new URL("../../../packages/adapters/mv/fixtures/mini/data/", import.meta.url);

function buildProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-aigen-"));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  for (const name of readdirSync(FIXTURE_DATA)) {
    writeFileSync(path.join(dir, "data", name), readFileSync(new URL(name, FIXTURE_DATA)));
  }
  return dir;
}

describe("aigen 命令（mock provider）", () => {
  it("生成合法场景并过校验闸门", async () => {
    const dir = buildProject();
    try {
      const valid = JSON.stringify({
        id: "ai-1",
        steps: [
          { type: "start_new_game" },
          { type: "walk", to: { map: 2, x: 1, y: 1 } },
          { type: "assert_map", map: 2 },
        ],
      });
      const outcome = await aigen(dir, "测试走到地图2", new MockProvider([valid]));
      expect(outcome.error).toBeNull();
      expect(outcome.attempts).toBe(1);
      expect(JSON.parse(outcome.scenarioJson!).steps).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("引用越界 → 打回重写后收敛", async () => {
    const dir = buildProject();
    try {
      const bad = JSON.stringify({
        id: "ai-2",
        steps: [{ type: "start_new_game" }, { type: "assert_switch", switchId: 999, value: true }],
      });
      const good = JSON.stringify({
        id: "ai-2",
        steps: [{ type: "start_new_game" }, { type: "assert_switch", switchId: 1, value: true }],
      });
      const outcome = await aigen(dir, "测试开关", new MockProvider([bad, good]));
      expect(outcome.error).toBeNull();
      expect(outcome.attempts).toBe(2);
      expect(outcome.feedback[0]).toContain("999");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
