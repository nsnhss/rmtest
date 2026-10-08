/**
 * 项目库 —— SQLite（node:sqlite，零原生依赖）。
 * 持久化：场景语料、运行结果、golden 基线、游戏指纹。
 */
import { DatabaseSync } from "node:sqlite";
import type { Scenario } from "@rmtest/dsl";

export interface StoredScenario {
  id: string;
  json: string;
  fingerprint: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredResult {
  id: number;
  scenarioId: string;
  passed: boolean;
  stepResultsJson: string;
  snapshotJson: string;
  runAt: number;
}

export interface StoredBaseline {
  tag: string;
  png: string; // base64
  width: number;
  height: number;
  createdAt: number;
}

export class ProjectStore {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        fingerprint TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id TEXT NOT NULL,
        passed INTEGER NOT NULL,
        step_results TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        run_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS baselines (
        tag TEXT PRIMARY KEY,
        png TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // —— 场景语料 ——
  upsertScenario(scenario: Scenario): void {
    const now = Date.now();
    const json = JSON.stringify(scenario);
    this.#db
      .prepare(
        `INSERT INTO scenarios (id, json, fingerprint, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET json=excluded.json, fingerprint=excluded.fingerprint, updated_at=excluded.updated_at`,
      )
      .run(scenario.id, json, scenario.game_fingerprint ?? null, now, now);
  }

  listScenarios(): StoredScenario[] {
    return this.#db
      .prepare("SELECT id, json, fingerprint, created_at, updated_at FROM scenarios ORDER BY updated_at DESC")
      .all() as unknown as StoredScenario[];
  }

  getScenario(id: string): Scenario | null {
    const row = this.#db.prepare("SELECT json FROM scenarios WHERE id = ?").get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Scenario) : null;
  }

  deleteScenario(id: string): void {
    this.#db.prepare("DELETE FROM scenarios WHERE id = ?").run(id);
  }

  // —— 运行结果 ——
  recordResult(input: { scenarioId: string; passed: boolean; stepResultsJson: string; snapshotJson: string }): number {
    const r = this.#db
      .prepare(
        `INSERT INTO results (scenario_id, passed, step_results, snapshot, run_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.scenarioId, input.passed ? 1 : 0, input.stepResultsJson, input.snapshotJson, Date.now());
    return Number(r.lastInsertRowid);
  }

  listResults(scenarioId: string): StoredResult[] {
    const rows = this.#db
      .prepare(
        "SELECT id, scenario_id, passed, step_results, snapshot, run_at FROM results WHERE scenario_id = ? ORDER BY run_at DESC",
      )
      .all(scenarioId) as unknown as Array<Omit<StoredResult, "passed"> & { passed: number }>;
    return rows.map((r) => ({ ...r, passed: r.passed === 1 }));
  }

  // —— golden 基线 ——
  saveBaseline(input: { tag: string; png: string; width: number; height: number }): void {
    this.#db
      .prepare(
        `INSERT INTO baselines (tag, png, width, height, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(tag) DO UPDATE SET png=excluded.png, width=excluded.width, height=excluded.height, created_at=excluded.created_at`,
      )
      .run(input.tag, input.png, input.width, input.height, Date.now());
  }

  getBaseline(tag: string): StoredBaseline | null {
    const row = this.#db.prepare("SELECT tag, png, width, height, created_at FROM baselines WHERE tag = ?").get(tag) as
      | StoredBaseline
      | undefined;
    return row ?? null;
  }

  listBaselines(): StoredBaseline[] {
    return this.#db.prepare("SELECT tag, png, width, height, created_at FROM baselines ORDER BY tag").all() as unknown as StoredBaseline[];
  }

  // —— 游戏指纹 ——
  setGameFingerprint(fp: string): void {
    this.#db
      .prepare("INSERT INTO meta (key, value) VALUES ('game_fingerprint', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(fp);
  }

  getGameFingerprint(): string | null {
    const row = this.#db.prepare("SELECT value FROM meta WHERE key = 'game_fingerprint'").get() as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  close(): void {
    this.#db.close();
  }
}
