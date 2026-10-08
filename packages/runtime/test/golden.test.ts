import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { compareGolden, takeScreenshot } from "../src/index.ts";
import type { ElectronFixture } from "./electron-fixture.ts";
import { launchFixture } from "./electron-fixture.ts";

let fx: ElectronFixture;

beforeAll(async () => {
  fx = await launchFixture();
}, 60_000);

afterAll(async () => {
  await fx.close();
});

describe("截图与 golden 基线", () => {
  it("截图可解码且尺寸与窗口一致", async () => {
    const shot = await takeScreenshot(fx.page, { tag: "menu" });
    expect(shot.tag).toBe("menu");
    expect(shot.width).toBe(816);
    expect(shot.height).toBe(624);
    expect(shot.allBlack).toBe(false);
  });

  it("同帧两次截图 → diff 为 0", async () => {
    const a = await takeScreenshot(fx.page, { tag: "t" });
    const b = await takeScreenshot(fx.page, { tag: "t" });
    const diff = compareGolden({ tag: "t", base64: b.base64 }, { base64: a.base64 });
    expect(diff.comparable).toBe(true);
    expect(diff.diffPixels).toBe(0);
  });

  it("画面改变 → diff 非零", async () => {
    const before = await takeScreenshot(fx.page, { tag: "t" });
    // 构造一张与截图同尺寸的全黑图作为"改变后的画面"
    const black = new PNG({ width: before.width, height: before.height });
    for (let i = 0; i < black.data.length; i += 4) {
      black.data[i + 3] = 255; // alpha
    }
    const diff = compareGolden({ tag: "t", base64: PNG.sync.write(black).toString("base64") }, { base64: before.base64 });
    expect(diff.comparable).toBe(true);
    expect(diff.diffPixels).toBeGreaterThan(0);
  });

  it("尺寸不同 → comparable=false", async () => {
    const small = new PNG({ width: 100, height: 100 });
    const diff = compareGolden(
      { tag: "t", base64: PNG.sync.write(small).toString("base64") },
      { base64: PNG.sync.write(new PNG({ width: 200, height: 100 })).toString("base64") },
    );
    expect(diff.comparable).toBe(false);
    expect(diff.diffRatio).toBe(1);
  });
});
