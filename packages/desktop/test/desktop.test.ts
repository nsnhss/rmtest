import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { connect, type Browser, type Page } from "puppeteer-core";
import { closeCdp, launchElectron } from "@rmtest/runtime";
import { t } from "@rmtest/i18n";

const APP_DIR = path.resolve(import.meta.dirname, "..");
const FIXTURE_DATA = new URL("../../../packages/adapters/mv/fixtures/mini/data/", import.meta.url);

/** DOM 层点击（evaluate 触发）——不依赖 puppeteer Input 域，规避协议层挂起 */
async function click(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    (document.querySelector(sel) as HTMLElement).click();
  }, selector);
}

/** 切换界面语言（触发 renderer 的 change 监听） */
async function setLang(page: Page, lang: string): Promise<void> {
  await page.evaluate((value) => {
    const select = document.getElementById("langSelect") as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event("change"));
  }, lang);
}

let browser: Browser | undefined;
let page: Page;
let proc: Parameters<typeof closeCdp>[0]["proc"] | undefined;
let projectDir: string | undefined;

beforeAll(async () => {
  // 打包主进程与渲染进程（dist 在 .gitignore 内）
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
    sourcemap: "inline",
  });
  await build({
    entryPoints: [path.join(APP_DIR, "src", "renderer.ts")],
    bundle: true,
    format: "iife",
    outfile: path.join(APP_DIR, "app", "dist", "renderer.js"),
  });

  // 无资源的数据工程（悬空引用 > 0，冒烟足够）
  projectDir = mkdtempSync(path.join(tmpdir(), "rmtest-desk-"));
  mkdirSync(path.join(projectDir, "data"), { recursive: true });
  for (const name of readdirSync(FIXTURE_DATA)) {
    writeFileSync(path.join(projectDir, "data", name), readFileSync(new URL(name, FIXTURE_DATA)));
  }

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
    // 例外（ts-no-test-timers）：集成测试等待真实 Electron 窗口就绪，平台时钟不可被假时钟控制
    await new Promise((r) => setTimeout(r, 300));
  }
  // renderer 就绪（语言选项由 LOCALE_LABELS 填充）后固定为中文，抵消上次运行遗留的 localStorage
  await page.waitForFunction(() => document.getElementById("langSelect")?.children.length === 4, { timeout: 20_000 });
  await setLang(page, "zh");
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

describe("桌面 UI 冒烟", () => {
  it("输入路径 → 点击扫描 → 统计与报告 iframe 出现", { timeout: 120_000 }, async () => {
    await setLang(page, "zh");
    await page.evaluate((dir) => {
      (document.getElementById("scanDir") as HTMLInputElement).value = dir;
    }, projectDir!);
    await click(page, "#scanBtn");
    await page.waitForFunction(() => (document.getElementById("scanResult")?.textContent ?? "").includes("错误"), { timeout: 90_000, polling: 100 });

    const text = await page.evaluate(() => document.getElementById("scanResult")!.textContent!);
    expect(text).toMatch(/错误 \d+/);
    // 无资源工程：悬空引用必然 > 0
    expect(text).not.toMatch(/错误 0/);

    const frameSrc = await page.evaluate(() => (document.getElementById("reportFrame") as HTMLIFrameElement).src);
    expect(frameSrc).toContain("rmtest-report.html");
    const frameVisible = await page.evaluate(() => !(document.getElementById("reportFrame") as HTMLIFrameElement).hidden);
    expect(frameVisible).toBe(true);
  });

  it("新内容检测按钮 → 报出可达事件页", { timeout: 120_000 }, async () => {
    await setLang(page, "zh");
    await page.evaluate((dir) => {
      (document.getElementById("contentDir") as HTMLInputElement).value = dir;
    }, projectDir!);
    await click(page, "#contentBtn");
    await page.waitForFunction(() => (document.getElementById("contentResult")?.textContent ?? "").includes("可达事件页"), { timeout: 90_000, polling: 100 });

    const text = await page.evaluate(() => document.getElementById("contentResult")!.textContent!);
    expect(text).toContain("可达事件页 2 个");
    expect(text).toContain("无基线");
  });

  it("场景库列表按钮 → 空语料报告", { timeout: 120_000 }, async () => {
    await setLang(page, "zh");
    await page.evaluate((dir) => {
      (document.getElementById("corpusDir") as HTMLInputElement).value = dir;
    }, projectDir!);
    await click(page, "#corpusListBtn");
    await page.waitForFunction(() => (document.getElementById("corpusResult")?.textContent ?? "").includes("语料"), { timeout: 90_000, polling: 100 });

    const text = await page.evaluate(() => document.getElementById("corpusResult")!.textContent!);
    expect(text).toContain("语料 0 个场景");
  });

  it("覆盖地图按钮 → 报出可达地图覆盖", { timeout: 120_000 }, async () => {
    await setLang(page, "zh");
    await page.evaluate((dir) => {
      (document.getElementById("vizDir") as HTMLInputElement).value = dir;
    }, projectDir!);
    await click(page, "#coverageBtn");
    await page.waitForFunction(() => (document.getElementById("vizResult")?.textContent ?? "").includes("场景覆盖"), { timeout: 90_000, polling: 100 });

    const text = await page.evaluate(() => document.getElementById("vizResult")!.textContent!);
    expect(text).toContain("场景覆盖: 0/2");
    expect(text).toContain("✗ 地图 1");
  });

  it("回归趋势按钮 → 无记录提示", { timeout: 120_000 }, async () => {
    await setLang(page, "zh");
    await page.evaluate((dir) => {
      (document.getElementById("vizDir") as HTMLInputElement).value = dir;
    }, projectDir!);
    await click(page, "#trendsBtn");
    await page.waitForFunction(() => (document.getElementById("vizResult")?.textContent ?? "").includes("回归记录"), { timeout: 90_000, polling: 100 });

    const text = await page.evaluate(() => document.getElementById("vizResult")!.textContent!);
    expect(text).toContain("近 14 天无回归记录");
  });

  it("切换语言 → 界面外壳与结果串跟随所选语言", { timeout: 120_000 }, async () => {
    // English：外壳来自 LOCALE_LABELS 之外的目录 key
    await setLang(page, "en");
    expect(await page.evaluate(() => document.getElementById("scanBtn")!.textContent)).toBe(t("en", "ui.btn.scan"));
    expect(await page.evaluate(() => document.querySelector("h1")!.textContent)).toBe(t("en", "ui.app.title"));
    expect(await page.evaluate(() => (document.getElementById("scanDir") as HTMLInputElement).placeholder)).toBe(
      t("en", "ui.placeholder.mvProject"),
    );
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");

    // 结果串也用新语言：复用 content 检测（2 个可达事件页、无基线）
    await page.evaluate((dir) => {
      (document.getElementById("contentDir") as HTMLInputElement).value = dir;
    }, projectDir!);
    await click(page, "#contentBtn");
    const totalEn = t("en", "ui.content.total", { count: 2 });
    await page.waitForFunction(
      (expected) => (document.getElementById("contentResult")?.textContent ?? "").includes(expected),
      { timeout: 90_000, polling: 100 },
      totalEn,
    );
    const text = await page.evaluate(() => document.getElementById("contentResult")!.textContent!);
    expect(text).toContain(totalEn);
    expect(text).toContain(t("en", "ui.content.noBaseline"));

    // 日本語 / 한국어 同样生效
    await setLang(page, "ja");
    expect(await page.evaluate(() => document.getElementById("scanBtn")!.textContent)).toBe(t("ja", "ui.btn.scan"));
    await setLang(page, "ko");
    expect(await page.evaluate(() => document.getElementById("scanBtn")!.textContent)).toBe(t("ko", "ui.btn.scan"));

    // 复位中文（同时持久化，避免污染后续复用 profile 的运行）
    await setLang(page, "zh");
    expect(await page.evaluate(() => document.getElementById("scanBtn")!.textContent)).toBe(t("zh", "ui.btn.scan"));
  });
});
