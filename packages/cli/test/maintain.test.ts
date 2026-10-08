import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject } from "@rmtest/adapter-mv";
import { maintain } from "../src/maintain.ts";

const FIXTURE_DATA = new URL("../../../packages/adapters/mv/fixtures/mini/data/", import.meta.url);

function buildProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-maint-"));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  for (const name of readdirSync(FIXTURE_DATA)) {
    writeFileSync(path.join(dir, "data", name), readFileSync(new URL(name, FIXTURE_DATA)));
  }
  return dir;
}

describe("maintain 命令", () => {
  it("三分类 + 重链（地图搬家）", () => {
    const dir = buildProject();
    try {
      const loaded = loadProject(dir);
      const map2Hash = loaded.fileHashes.get("data/Map002.json")!;
      expect(map2Hash).toBeTruthy();

      const corpus = [
        { id: "fresh-1", game_fingerprint: loaded.fingerprint, steps: [{ type: "start_new_game" }] },
        { id: "stale-1", game_fingerprint: "old-fp", steps: [{ type: "start_new_game" }] },
        // broken：引用地图 5（不存在），但绑定哈希恰好命中现网 Map002 → 重链到 2
        {
          id: "broken-1",
          game_fingerprint: loaded.fingerprint,
          bindings: [{ kind: "map", id: 5, hash: map2Hash }],
          steps: [{ type: "start_new_game" }, { type: "walk", to: { map: 5, x: 1, y: 1 } }],
        },
        // broken 且无法重链：引用地图 5 且无绑定
        {
          id: "broken-2",
          game_fingerprint: loaded.fingerprint,
          steps: [{ type: "start_new_game" }, { type: "walk", to: { map: 5, x: 1, y: 1 } }],
        },
        // 非法条目
        { id: "bad", steps: "不是数组" },
      ];

      const outcome = maintain(dir, corpus);
      expect(outcome.report).toMatchObject({ fresh: 1, stale: 1, broken: 2 });
      expect(outcome.relinked).toBe(1);
      expect(outcome.unresolved).toBe(1);
      expect(outcome.badEntries).toHaveLength(1);

      const repaired = outcome.corpus.find((s) => s.id === "broken-1")!;
      const walkStep = repaired.steps[1] as { to: { map: number } };
      expect(walkStep.to.map).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
