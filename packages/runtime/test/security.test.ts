import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRealGame, hardenPage, launchRealGame, type RealGameSession } from "../src/index.ts";
import type { ElectronFixture } from "./electron-fixture.ts";
import { launchFixture } from "./electron-fixture.ts";

let fx: ElectronFixture;

beforeAll(async () => {
  fx = await launchFixture();
}, 60_000);

afterAll(async () => {
  await fx.close();
});

describe("运行时加固", () => {
  it("外部网络请求被拦截并记录", async () => {
    const stats = await hardenPage(fx.page);
    const blockedUrl = "https://example.com/telemetry.png";
    const loaded = await fx.page.evaluate((url) => {
      return new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
    }, blockedUrl);

    expect(loaded).toBe(false); // 加载失败 = 被拦截
    expect(stats.blocked).toContain(blockedUrl);
  });

  it("页面脚本仍正常工作（本地功能不受影响）", async () => {
    await hardenPage(fx.page);
    const ok = await fx.page.evaluate(() => typeof (window as unknown as { __game: unknown }).__game === "object");
    expect(ok).toBe(true);
  });
});

describe("真实引擎加载路径的加固接线", () => {
  it("launchRealGame 后页面请求拦截生效，外部 URL 被拦截并记录在 hardening.blocked", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
    const dir = mkdtempSync(path.join(tmpdir(), "rmtest-harden-"));
    // 真实工程 index.html 的最小替身：launchRealGame 只要求页面 URL 含 index.html
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><meta charset=\"utf-8\"><title>harden-fixture</title>");

    let session: RealGameSession | undefined;
    try {
      session = await launchRealGame(dir, { electronPath: electronExe });
      const blockedUrl = "https://example.com/telemetry.png";
      const loaded = await session.page.evaluate((url: string) => {
        const { promise, resolve } = Promise.withResolvers<boolean>();
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
        return promise;
      }, blockedUrl);

      expect(loaded).toBe(false); // 外部请求被 abort
      expect(session.hardening.blocked).toContain(blockedUrl); // 且被记录，供证据/报告使用
    } finally {
      if (session) await closeRealGame(session);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
