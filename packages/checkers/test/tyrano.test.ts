/**
 * Tyrano 检查器集成测试 —— 用真实加载器构造工程，全链路（load → check）验证。
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildLifecycle, buildRefGraph, runCheckers, type CheckRunResult } from "@rmtest/core";
import type { LoadedProject } from "@rmtest/adapter-tyrano";
import { loadProject } from "@rmtest/adapter-tyrano";
import { checkers } from "../src/index.ts";

function buildProject(files: Record<string, string>): string {
  const dir = path.join(os.tmpdir(), `rmtest-tyrano-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function run(dir: string): CheckRunResult {
  const loaded = loadProject(dir) as LoadedProject;
  const facts = {
    refgraph: buildRefGraph(loaded.ir),
    lifecycle: buildLifecycle(loaded.ir),
    universe: loaded.universe,
    assets: loaded.assets,
  };
  return runCheckers(checkers, facts, loaded.ir);
}

describe("Tyrano 检查器", () => {
  it("完全合法工程 → 零 Tyrano 报告", () => {
    const dir = buildProject({
      "index.html": "<html></html>",
      "data/system/Config.tjs": 'firstScenario = "first.ks";\nfirstLabel = "*start";',
      "data/scenario/first.ks": [
        "*start",
        "[bg storage=\"room.png\"]",
        "[jump target=*end]",
        "*end",
        "[playbgm storage=\"bgm.ogg\"]",
        "[end]",
      ].join("\n"),
      "data/bgimage/room.png": "x",
      "data/bgm/bgm.ogg": "x",
    });
    try {
      const result = run(dir);
      expect(result.errors).toEqual([]);
      expect(result.sections.filter((s) => s.type.startsWith("tyrano-"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("断链跳转/缺失资产/死循环/入口缺失/不可达标签/语法错误 → 全部命中", () => {
    const dir = buildProject({
      "index.html": "<html></html>",
      "data/system/Config.tjs": 'firstScenario = "first.ks";\nfirstLabel = "*start";',
      "data/scenario/first.ks": [
        "*start",
        "[bg storage=\"missing.png\"]", // 缺失资产（error）
        "[jump target=*ghost]", // 不存在的标签（error）
        "*loop",
        "[jump target=*loop]", // 无条件自跳（error）
        "*bad",
        "[if exp=\"f.x\"]",
        "[jump target=*bad]", // 条件自跳（合法，不报）
        "[endif]",
        "[jump target=*start storage=gone.ks]", // 不存在的场景文件（error）
        "*unused", // 无任何指向（info）
        "[if exp=\"f.y\"]", // 未闭合（error）
        "[end]",
      ].join("\n"),
      "data/bgimage/Bg.png": "x", // 引用 missing.png；另留大小写素材供专用用例
    });
    try {
      const sections = run(dir).sections;
      const ty = sections.filter((s) => s.type.startsWith("tyrano-"));

      const broken = ty.filter((s) => s.type === "tyrano-broken-jump");
      expect(broken).toHaveLength(2);
      expect(broken.some((s) => s.message.includes("标签 *ghost"))).toBe(true);
      expect(broken.some((s) => s.message.includes("场景 gone.ks"))).toBe(true);

      const asset = ty.filter((s) => s.type === "tyrano-missing-asset" && s.severity === "error");
      expect(asset).toHaveLength(1);
      expect(asset[0]!.message).toContain("missing.png");

      const loop = ty.filter((s) => s.type === "tyrano-self-loop");
      expect(loop).toHaveLength(1);
      expect(loop[0]!.message).toContain("死循环");

      const unreachable = ty.filter((s) => s.type === "tyrano-unreachable-label");
      expect(unreachable).toHaveLength(1);
      expect(unreachable[0]!.message).toContain("*unused");

      const syntax = ty.filter((s) => s.type === "tyrano-syntax");
      expect(syntax).toHaveLength(1);
      expect(syntax[0]!.message).toContain("未闭合");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("大小写不一致 → warning；入口场景缺失 → error", () => {
    const dir = buildProject({
      "index.html": "<html></html>",
      "data/system/Config.tjs": 'firstScenario = "nope.ks";\nfirstLabel = "*start";',
      "data/scenario/first.ks": ["*start", "[bg storage=\"room.png\"]", "[end]"].join("\n"),
      "data/bgimage/ROOM.PNG": "x",
    });
    try {
      const sections = run(dir).sections;
      const warn = sections.filter((s) => s.type === "tyrano-missing-asset" && s.severity === "warning");
      expect(warn).toHaveLength(1);
      expect(warn[0]!.message).toContain("大小写不一致");

      const entry = sections.filter((s) => s.type === "tyrano-entry");
      expect(entry).toHaveLength(1);
      expect(entry[0]!.message).toContain("nope.ks");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("跨场景跳转校验：目标场景存在但标签不存在 → 报；都存在 → 不报", () => {
    const dir = buildProject({
      "index.html": "<html></html>",
      "data/system/Config.tjs": 'firstScenario = "first.ks";\nfirstLabel = "*start";',
      "data/scenario/first.ks": [
        "*start",
        "[jump target=*missing storage=other.ks]",
        "[jump target=*ok storage=other.ks]",
        "[end]",
      ].join("\n"),
      "data/scenario/other.ks": ["*ok", "[return]", ""].join("\n"),
    });
    try {
      const sections = run(dir).sections;
      const broken = sections.filter((s) => s.type === "tyrano-broken-jump");
      expect(broken).toHaveLength(1);
      expect(broken[0]!.message).toContain("*missing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
