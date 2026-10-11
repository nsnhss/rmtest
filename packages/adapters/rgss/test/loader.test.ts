/**
 * RGSS 工程加载 —— 图标网格按 VX Ace/XP 的 24px 计。
 * 实测依据：真实 VX Ace 工程 IconSet.png 384×1536（16×64=1024 格），
 * 按 MV 的 32px 计只有 576 格，会把 iconIndex 577..1005 的条目误报为越界。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject } from "../src/loader.ts";

/** 最小 PNG：readPngSize 只读签名 + IHDR（宽高），足够测尺寸解析 */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("RGSS 工程加载", () => {
  it("IconSet 按 24px 网格计图标数（384×1536 → 1024，而非按 32px 的 576）", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rmtest-rgss-"));
    mkdirSync(path.join(dir, "Graphics", "System"), { recursive: true });
    writeFileSync(path.join(dir, "Graphics", "System", "IconSet.png"), pngHeader(384, 1536));
    try {
      const loaded = loadProject(dir);
      expect(loaded.universe.iconCellSize).toBe(24);
      expect(loaded.universe.iconCount).toBe(1024);
      expect(loaded.assets.find((a) => a.relPath === "img/system/IconSet.png")).toMatchObject({
        width: 384,
        height: 1536,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
