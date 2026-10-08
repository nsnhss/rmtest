import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fuzzCli } from "../src/fuzz.ts";
import { goldenCli } from "../src/golden.ts";

const PROJECT = process.env["RM_REAL_PROJECT"];

// 全部操作在工程副本上进行，绝不污染用户真实工程
function copyProject(src: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-cli-dyn-"));
  cpSync(src, dir, { recursive: true });
  return dir;
}

describe.skipIf(!PROJECT)("CLI fuzz + golden（真实引擎）", () => {
  it("fuzz：探索产生新颖状态且无崩溃", { timeout: 180_000 }, async () => {
    const dir = copyProject(PROJECT!);
    try {
      const result = await fuzzCli(dir, { maxSteps: 80, timeBudgetMs: 20_000, seed: 42 });
      expect(result.crashes).toEqual([]);
      expect(result.steps).toBeGreaterThan(0);
      expect(result.novelStates).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("golden：approve → check 同帧 diff 为 0", { timeout: 180_000 }, async () => {
    const dir = copyProject(PROJECT!);
    try {
      const approved = await goldenCli(dir, "e2e-tag", "approve");
      expect(approved.baselineExisted).toBe(false); // 首次 approve 无旧基线
      const checked = await goldenCli(dir, "e2e-tag", "check");
      expect(checked.comparable).toBe(true);
      expect(checked.diffRatio).toBeLessThan(0.05);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
