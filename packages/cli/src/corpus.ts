/**
 * CLI corpus —— 场景语料库管理（SQLite）。
 * add:  场景 JSON 入库存档（bug 修复 → 场景入库 → 永久回归）
 * list: 列出语料 + 各场景当前时效性（fresh/broken/stale）
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadProjectAny } from "./loader.ts";
import { ScenarioSchema } from "@rmtest/dsl";
import { classifyScenario } from "@rmtest/freshness";
import { ProjectStore } from "@rmtest/store";

function dbPath(projectDir: string): string {
  return path.join(projectDir, "rmtest.db");
}

export interface CorpusListEntry {
  id: string;
  status: "fresh" | "broken" | "stale";
  issues: string[];
}

export interface CorpusAddResult {
  id: string;
  steps: number;
}

export function corpusAdd(projectDir: string, scenarioPath: string): CorpusAddResult {
  const scenario = ScenarioSchema.parse(JSON.parse(readFileSync(scenarioPath, "utf8")));
  const store = new ProjectStore(dbPath(projectDir));
  try {
    store.upsertScenario(scenario);
  } finally {
    store.close();
  }
  return { id: scenario.id, steps: scenario.steps.length };
}

export function corpusList(projectDir: string): CorpusListEntry[] {
  const loaded = loadProjectAny(projectDir).project;
  const store = new ProjectStore(dbPath(projectDir));
  try {
    return store.listScenarios().map((s) => {
      const scenario = ScenarioSchema.parse(JSON.parse(s.json));
      const result = classifyScenario(scenario, loaded.ir, loaded.universe, loaded.fingerprint);
      return { id: scenario.id, status: result.status, issues: result.issues };
    });
  } finally {
    store.close();
  }
}
