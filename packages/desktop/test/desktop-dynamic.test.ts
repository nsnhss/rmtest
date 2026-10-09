import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { connect, type Browser, type Page } from "puppeteer-core";
import { closeCdp, launchElectron } from "@rmtest/runtime";

const PROJECT = process.env["RM_REAL_PROJECT"];
const APP_DIR = path.resolve(import.meta.dirname, "..");

let browser: Browser;
let page: Page;
let proc: Parameters<typeof closeCdp>[0]["proc"] | undefined;
let projectDir: string | undefined;

beforeAll(async () => {
  await build({
    entryPoints: [path.join(APP_DIR, "src", "main.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["electron"],
    banner: {
      js: "import { createRequire as __rmtestShimCreateRequire } from 'node:module'; import { fileURLToPath as __rmtestFileURLToPath } from 'node:url'; const require = __rmtestShimCreateRequire(import.meta.url); const __dirname = __rmtestFileURLToPath(new URL('.', import.meta.url));",
    },
    outfile: path.join(APP_DIR, "dist", "main.mjs"),
  });
  await build({
    entryPoints: [path.join(APP_DIR, "src", "renderer.ts")],
    bundle: true,
    format: "iife",
    outfile: path.join(APP_DIR, "app", "dist", "renderer.js"),
  });

  projectDir = mkdtempSync(path.join(tmpdir(), "rmtest-desk-dyn-"));
  cpSync(PROJECT!, projectDir, { recursive: true });

  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
  const port = 9400 + Math.floor(Math.random() * 500);
  const session = await launchElectron((url) => connect({ browserURL: url, defaultViewport: null }) as Promise<unknown>, {
    electronPath: electronExe,
    appDir: APP_DIR,
    port,
  });
  browser = session.browser as Browser;
  proc = session.proc;
  const deadline = Date.now() + 20_000;
  for (;;) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes("index.html"))!;
    if (page) break;
    if (Date.now() > deadline) throw new Error("桌面窗口未就绪");
    await new Promise((r) => setTimeout(r, 300));
  }
}, 120_000);

afterAll(async () => {
  if (browser && proc) {
    await closeCdp({ browser, proc, port: 0 }, async (b) => {
      try {
        await (b as Browser).close();
      } catch {
        // 已断连
      }
    });
  }
  if (projectDir) rmSync(projectDir, { recursive: true, force: true });
});

describe.skipIf(!PROJECT)("桌面动态测试按钮（真实引擎）", () => {
  it("fuzz 按钮 → 探索结果", { timeout: 240_000 }, async () => {
    await page.evaluate((dir) => {
      (document.getElementById("dynDir") as HTMLInputElement).value = dir;
      (document.getElementById("dynArg") as HTMLInputElement).value = "42";
    }, projectDir!);
    await page.click("#fuzzBtn");
    await page.waitForFunction(() => (document.getElementById("dynResult")?.textContent ?? "").includes("步数"), { timeout: 180_000 });
    const text = await page.evaluate(() => document.getElementById("dynResult")!.textContent!);
    expect(text).toContain("崩溃 0");
  });

  it("golden 批准 → 对比 → diff 为 0", { timeout: 240_000 }, async () => {
    await page.evaluate((dir) => {
      (document.getElementById("dynDir") as HTMLInputElement).value = dir;
      (document.getElementById("dynArg") as HTMLInputElement).value = "desk-tag";
    }, projectDir!);
    await page.click("#goldenApproveBtn");
    await page.waitForFunction(() => (document.getElementById("dynResult")?.textContent ?? "").includes("已批准"), { timeout: 180_000 });

    await page.click("#goldenCheckBtn");
    await page.waitForFunction(() => (document.getElementById("dynResult")?.textContent ?? "").includes("diffRatio"), { timeout: 180_000 });
    const text = await page.evaluate(() => document.getElementById("dynResult")!.textContent!);
    expect(text).toContain("diffRatio=0.0000");
  });

  it("录制开始 → 按键游玩 → 停止保存场景", { timeout: 240_000 }, async () => {
    await page.evaluate((dir) => {
      (document.getElementById("dynDir") as HTMLInputElement).value = dir;
    }, projectDir!);
    await page.click("#recordStartBtn");
    await page.waitForFunction(() => (document.getElementById("dynResult")?.textContent ?? "").includes("录制中"), { timeout: 180_000 });

    // 找到游戏窗口并注入按键（录制器用 keydown 监听捕获）
    const pages = await browser.pages();
    const gamePage = pages.find((p) => p !== page && p.url().includes("index.html"))!;
    expect(gamePage).toBeTruthy();
    await gamePage.waitForFunction(() => (window as never as { __rmtestReal?: { ready?: () => boolean } }).__rmtestReal?.ready?.() === true, { timeout: 60_000 });

    const key = async (k: string) => {
      await gamePage.evaluate((keyName) => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: keyName }));
      }, k);
      await new Promise((r) => setTimeout(r, 120));
    };
    await key("ArrowRight");
    await key("ArrowRight");
    await key("ArrowRight");
    await key("ArrowDown");
    await key("ArrowDown");
    await key("ArrowDown");

    await page.click("#recordStopBtn");
    await page.waitForFunction(() => (document.getElementById("dynResult")?.textContent ?? "").includes("已保存"), { timeout: 180_000 });
    const text = await page.evaluate(() => document.getElementById("dynResult")!.textContent!);
    expect(text).toContain("recorded-scenario.json");

    // 产物场景可解析且包含移动
    const { readFileSync, existsSync } = await import("node:fs");
    const outPath = path.join(projectDir!, "recorded-scenario.json");
    expect(existsSync(outPath)).toBe(true);
    const scenario = JSON.parse(readFileSync(outPath, "utf8"));
    expect(scenario.steps.some((s: { type: string }) => s.type === "walk")).toBe(true);
  });
});
