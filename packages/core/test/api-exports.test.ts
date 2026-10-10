/**
 * API 契约测试 —— 包导出面、IR 版本闸门、检查器注册不变量。
 * 这些是跨包消费者依赖的硬契约：任何一个破坏都会让插件/报告/CLI 静默失效。
 */
import { describe, expect, it } from "vitest";
import { IR_SCHEMA_VERSION, runCheckers, type IRDocument } from "@rmtest/core";
import { checkers } from "@rmtest/checkers";

// 包导出面：主符号必须存在（类型层面由 typecheck 保证，这里验证运行时导出）
import * as core from "@rmtest/core";
import * as mvAdapter from "@rmtest/adapter-mv";
import * as rgssAdapter from "@rmtest/adapter-rgss";
import * as rm2kAdapter from "@rmtest/adapter-rm2k";
import * as tyranoAdapter from "@rmtest/adapter-tyrano";
import * as gbsAdapter from "@rmtest/adapter-gbs";
import * as godotAdapter from "@rmtest/adapter-godot";
import * as reportPkg from "@rmtest/report";
import * as dslPkg from "@rmtest/dsl";
import * as runtimePkg from "@rmtest/runtime";

describe("包 API 契约", () => {
  it("各包核心导出存在", () => {
    expect(typeof core.runCheckers).toBe("function");
    expect(typeof core.buildRefGraph).toBe("function");
    expect(typeof core.buildLifecycle).toBe("function");
    expect(typeof core.universeFromIR).toBe("function");
    expect(typeof mvAdapter.loadProject).toBe("function");
    expect(typeof rgssAdapter.loadProject).toBe("function");
    expect(typeof rm2kAdapter.loadProject).toBe("function");
    expect(typeof tyranoAdapter.loadProject).toBe("function");
    expect(typeof gbsAdapter.loadProject).toBe("function");
    expect(typeof godotAdapter.loadProject).toBe("function");
    expect(typeof reportPkg.renderReport).toBe("function");
    expect(typeof dslPkg.validateScenario).toBe("function");
    expect(typeof runtimePkg.launchElectron).toBe("function");
  });

  it("IR 版本闸门：更高 irVersion 的检查器被内核拒绝且不崩溃", () => {
    const futureChecker = {
      manifest: { name: "future-checker", version: "0.0.1", irVersion: IR_SCHEMA_VERSION + 1, facts: [] },
      check: () => [],
    };
    const result = runCheckers([futureChecker], {}, { schemaVersion: IR_SCHEMA_VERSION, engine: "mv" } as never);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.plugin).toBe("future-checker");
    expect(result.sections).toEqual([]);
  });

  it("缺少 facts 的检查器被拒绝并报出缺项", () => {
    const hungry = {
      manifest: { name: "hungry", version: "0.0.1", irVersion: 1, facts: ["nonexistent-fact"] },
      check: () => [],
    };
    const result = runCheckers([hungry], {}, { schemaVersion: IR_SCHEMA_VERSION, engine: "mv" } as never);
    expect(result.errors[0]!.message).toContain("nonexistent-fact");
  });

  it("检查器注册表：名称唯一 + irVersion 全部 ≤ 当前 schema", () => {
    const names = new Set<string>();
    for (const c of checkers) {
      expect(names.has(c.manifest.name)).toBe(false);
      names.add(c.manifest.name);
      expect(c.manifest.irVersion).toBeLessThanOrEqual(IR_SCHEMA_VERSION);
      expect(c.manifest.facts.every((f) => typeof f === "string")).toBe(true);
    }
    expect(names.size).toBeGreaterThanOrEqual(34);
  });

  it("所有检查器在 MV 空 IR 上不抛异常（引擎无关性）", () => {
    const emptyIr = {
      schemaVersion: IR_SCHEMA_VERSION,
      engine: "mv",
      system: { switches: [], variables: [], startMapId: 0, startX: 0, startY: 0, title1Name: "", title2Name: "", sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } }, vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } } },
      maps: [],
      actors: [],
      commonEvents: [],
      tilesets: [],
      items: [],
      weapons: [],
      armors: [],
      skills: [],
      troops: [],
      enemies: [],
      animations: [],
      classes: [],
    } as never;
    const ir = emptyIr as unknown as IRDocument;
    const facts = {
      refgraph: core.buildRefGraph(ir),
      lifecycle: core.buildLifecycle(ir),
      universe: core.universeFromIR(ir),
      assets: [] as unknown[],
    };
    const result = runCheckers(checkers, facts, ir);
    expect(result.errors).toEqual([]);
    expect(result.sections).toEqual([]);
  });
});
