import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Browser, type Page } from "puppeteer-core";
import { type Scenario } from "@rmtest/dsl";
import { closeCdp, executeScenario, launchElectron } from "../src/index.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
const appDir = path.resolve(import.meta.dirname, "../spike/app");

let browser: Browser;
let page: Page;
let proc: ChildProcess;

beforeAll(async () => {
  const session = await launchElectron((url) => connect({ browserURL: url }) as Promise<unknown>, {
    electronPath: electronExe,
    appDir,
  });
  browser = session.browser as Browser;
  proc = session.proc;
  const pages = await browser.pages();
  page = pages.find((p) => p.url().includes("fixture.html"))!;
  expect(page).toBeTruthy();
}, 60_000);

afterAll(async () => {
  await closeCdp({ browser, proc, port: 0 }, async (b) => {
    try {
      await (b as Browser).close();
    } catch {
      // 已断连
    }
  });
});

describe("场景执行器（stub 运行时）", () => {
  it("完整通过：开局 → 交互 → 断言开关与传送", async () => {
    const scenario: Scenario = {
      id: "pass-1",
      steps: [
        { type: "start_new_game" },
        { type: "interact", direction: "up" },
        { type: "assert_switch", switchId: 1, value: true },
        { type: "assert_map", map: 2 },
      ],
    };
    const result = await executeScenario(page, scenario);
    expect(result.passed).toBe(true);
    expect(result.stepResults.map((r) => r.passed)).toEqual([true, true, true, true]);
    expect(result.finalSnapshot.transfer).toMatchObject({ mapId: 2, x: 2, y: 2 });
  });

  it("断言失败：开关不符 → 失败即停并给出实际值", async () => {
    const scenario: Scenario = {
      id: "fail-1",
      steps: [
        { type: "start_new_game" },
        { type: "assert_switch", switchId: 2, value: true },
        { type: "assert_switch", switchId: 1, value: true }, // 不应执行
      ],
    };
    const result = await executeScenario(page, scenario);
    expect(result.passed).toBe(false);
    expect(result.stepResults).toHaveLength(2); // 失败即停
    expect(result.stepResults[1]!.message).toContain("开关 2");
    expect(result.stepResults[1]!.message).toContain("实际 false");
  });

  it("断言失败：地图不符", async () => {
    const scenario: Scenario = {
      id: "fail-2",
      steps: [
        { type: "start_new_game" },
        { type: "assert_map", map: 5 },
      ],
    };
    const result = await executeScenario(page, scenario);
    expect(result.passed).toBe(false);
    expect(result.stepResults[1]!.message).toContain("地图期望 5");
  });
});
