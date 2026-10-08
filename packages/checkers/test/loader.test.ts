import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCheckersFromDir } from "../src/loader.ts";

const VALID_CHECKER = `
import type { CheckerPlugin } from "@rmtest/core";
const checker: CheckerPlugin = {
  manifest: { name: "custom-check", version: "0.1.0", irVersion: 1, facts: [] },
  check() {
    return [{ type: "custom-check", severity: "info", confidence: "low", message: "自定义检查器已运行" }];
  },
};
export default checker;
`;

const BROKEN_CHECKER = `export default { nope: true };`;

describe("插件加载器", () => {
  it("加载合法 checker 并隔离坏文件", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rmtest-plugins-"));
    writeFileSync(path.join(dir, "good.ts"), VALID_CHECKER);
    writeFileSync(path.join(dir, "bad.ts"), BROKEN_CHECKER);
    try {
      const { checkers, errors } = await loadCheckersFromDir(dir);
      expect(checkers).toHaveLength(1);
      expect(checkers[0]!.manifest.name).toBe("custom-check");
      // 坏文件被隔离，不炸加载器
      expect(errors).toHaveLength(1);
      expect(errors[0]!.file).toBe("bad.ts");
      // 加载的 checker 可执行
      const sections = checkers[0]!.check({}, undefined as never);
      expect(sections[0]!.message).toContain("自定义检查器已运行");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("目录不存在 → 错误而非崩溃", async () => {
    const { checkers, errors } = await loadCheckersFromDir(path.join(tmpdir(), "rmtest-not-exist"));
    expect(checkers).toEqual([]);
    expect(errors[0]!.message).toContain("目录不可读");
  });
});
