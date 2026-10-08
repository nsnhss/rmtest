import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hardenPage } from "../src/index.ts";
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
