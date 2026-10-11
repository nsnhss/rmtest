import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriveStepBudget, fuzzGame, mulberry32 } from "../src/index.ts";
import type { ElectronFixture } from "./electron-fixture.ts";
import { launchFixture } from "./electron-fixture.ts";

let fx: ElectronFixture;

beforeAll(async () => {
  fx = await launchFixture();
}, 60_000);

afterAll(async () => {
  await fx.close();
});

describe("fuzz 探索器", () => {
  it("PRNG 同种子同序列", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("同种子 → 两次运行结果完全一致（确定性步数，无墙钟截断）", async () => {
    // 终止条件只有确定性步数预算（maxSteps），与墙钟无关 → 端到端可复现
    const opts = { maxSteps: 300, seed: 7 };
    const r1 = await fuzzGame(fx.page, opts);
    const r2 = await fuzzGame(fx.page, opts);
    expect(r1.truncated).toBe(false);
    expect(r1.steps).toBe(300);
    expect(r2.steps).toBe(r1.steps);
    expect(r2.novelStates).toBe(r1.novelStates);
    expect(r2.crashes).toEqual(r1.crashes);
    expect(r1.seed).toBe(7);
  });

  it("省略 maxSteps → 步数预算由种子派生且可复现", async () => {
    expect(deriveStepBudget(9)).toBe(deriveStepBudget(9));
    const r1 = await fuzzGame(fx.page, { seed: 9 });
    const r2 = await fuzzGame(fx.page, { seed: 9 });
    expect(r1.steps).toBe(deriveStepBudget(9));
    expect(r2.steps).toBe(r1.steps);
    expect(r1.truncated).toBe(false);
  });

  it("墙钟安全上限触发 → 有界截断并标记不可复现", async () => {
    const r = await fuzzGame(fx.page, { safetyBudgetMs: 60, maxSteps: 1_000_000, seed: 1 });
    expect(r.truncated).toBe(true);
    expect(r.steps).toBeLessThan(1_000_000);
  });

  it("探索覆盖事件格：interact 路径产生覆盖计数", async () => {
    const r = await fuzzGame(fx.page, { maxSteps: 500, seed: 3 });
    expect(r.crashes).toEqual([]);
    expect(r.coverage.pages["1:2:2:0"] ?? 0).toBeGreaterThan(0);
  });

  it("游戏抛异常 → 捕获进 crashes 并终止", async () => {
    await fx.page.evaluate(() => {
      const game = (window as unknown as { __game: { walk: () => void; interact: () => void } }).__game;
      game.walk = () => {
        throw new Error("boom");
      };
      game.interact = () => {
        throw new Error("boom");
      };
    });
    const r = await fuzzGame(fx.page, { maxSteps: 10, seed: 1 });
    expect(r.crashes).toHaveLength(1);
    expect(r.crashes[0]).toContain("boom");
    expect(r.steps).toBe(0); // 首步即崩，计数不推进
  });
});
