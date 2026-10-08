import { describe, expect, it } from "vitest";
import { readPngSize } from "../src/png.ts";
import { makePng } from "./png-helpers.ts";

describe("PNG 尺寸解析", () => {
  it("读 IHDR 宽高", () => {
    expect(readPngSize(makePng(144, 192))).toEqual({ width: 144, height: 192 });
    expect(readPngSize(makePng(512, 512))).toEqual({ width: 512, height: 512 });
  });

  it("非 PNG / 过短 / 非法尺寸 → null", () => {
    expect(readPngSize(new Uint8Array(10))).toBeNull();
    const badSig = makePng(10, 10);
    badSig[0] = 0x00;
    expect(readPngSize(badSig)).toBeNull();
    expect(readPngSize(makePng(0, 10))).toBeNull();
  });
});
