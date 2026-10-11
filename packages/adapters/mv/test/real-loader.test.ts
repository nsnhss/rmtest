/**
 * 真实工程加载验证 —— RM_REAL_PROJECT 指向本机 MV/MZ 游戏根（含 data/）时启用。
 * 目的：把"加密资源可解密 + 尺寸可解析"钉在真实数据上。
 * 修复前该用例失败：密钥推导用 ASCII 字节，解密结果不是 PNG → 资产尺寸全部解析失败。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject } from "../src/loader.ts";

const PROJECT = process.env["RM_REAL_PROJECT"];

describe.skipIf(!PROJECT)("真实 MV/MZ 工程加载", () => {
  it("资源尺寸可解析；无解密/PNG 解析失败告警", () => {
    const dir = PROJECT!;
    const flavor = existsSync(path.join(dir, "js", "rmmz_core.js")) ? "mz" : "mv";
    const loaded = loadProject(dir, flavor);

    const bad = loaded.warnings.filter((w) => /解密|PNG 尺寸解析失败/.test(w));
    expect(bad, `告警: ${JSON.stringify(loaded.warnings.slice(0, 5))}`).toEqual([]);
    expect(loaded.assets.length).toBeGreaterThan(0);
    for (const a of loaded.assets) {
      expect(a.width).toBeGreaterThan(0);
      expect(a.height).toBeGreaterThan(0);
    }
    expect(loaded.ir.maps.length).toBeGreaterThan(0);
  }, 120_000);
});
