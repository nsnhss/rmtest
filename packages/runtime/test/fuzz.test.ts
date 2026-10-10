import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuzzGame, mulberry32 } from "../src/index.ts";
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

  it("同种子 → 步数与新颖状态数可复现", async () => {
    // 时间预算给足（60s），步数封顶 300 成为唯一终止条件 → 与墙钟无关，可复现
    const opts = { timeBudgetMs: 60_000, maxSteps: 300, seed: 7 };
    const r1 = await fuzzGame(fx.page, opts);
    const r2 = await fuzzGame(fx.page, opts);
    expect(r1.steps).toBe(300);
    expect(r1.steps).toBe(r2.steps);
    expect(r1.novelStates).toBe(r2.novelStates);
    expect(r1.steps).toBeGreaterThan(0);
  });

  it("时间盒生效：预算 100ms 时步数有界", async () => {
    const r = await fuzzGame(fx.page, { timeBudgetMs: 100, maxSteps: 100000, seed: 1 });
    expect(r.steps).toBeLessThan(100000);
  });

  it("探索覆盖事件格：interact 路径产生覆盖计数", async () => {
    const r = await fuzzGame(fx.page, { timeBudgetMs: 800, maxSteps: 500, seed: 3 });
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
    const r = await fuzzGame(fx.page, { timeBudgetMs: 5_000, maxSteps: 10, seed: 1 });
    expect(r.crashes).toHaveLength(1);
    expect(r.crashes[0]).toContain("boom");
    expect(r.steps).toBe(0); // 首步即崩，计数不推进
  });
});
