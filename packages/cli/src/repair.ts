/**
 * CLI repair —— 过时场景的 AI 修复提案（stale → AI → 闸门 → 提案）。
 * 纯静态 + AI，不需要游戏运行。终审是人：提案列表 diff 给人看，--apply 才写回。
 */
import { readFileSync } from "node:fs";
import { loadProject } from "@rmtest/adapter-mv";
import { buildGameSurface, repairScenario, type ChatProvider } from "@rmtest/ai";
import { ScenarioSchema, type Scenario } from "@rmtest/dsl";
import { classifyScenario } from "@rmtest/freshness";

export interface RepairProposal {
  scenarioId: string;
  /** AI 提案过闸门后的场景 JSON；null = 提案失败 */
  scenarioJson: string | null;
  attempts: number;
  feedback: string[];
  error: string | null;
}

export interface RepairOutcome {
  proposals: RepairProposal[];
  staleCount: number;
}

export async function repairCli(
  projectDir: string,
  rawCorpus: unknown[],
  provider: ChatProvider,
): Promise<RepairOutcome> {
  const loaded = loadProject(projectDir);
  const surface = buildGameSurface(loaded.ir);

  const corpus: Scenario[] = [];
  for (const entry of rawCorpus) {
    const parsed = ScenarioSchema.safeParse(entry);
    if (parsed.success) corpus.push(parsed.data);
  }

  const proposals: RepairProposal[] = [];
  for (const scenario of corpus) {
    const status = classifyScenario(scenario, loaded.ir, loaded.universe, loaded.fingerprint).status;
    if (status !== "stale") continue;
    const result = await repairScenario(scenario, surface, loaded.ir, loaded.universe, provider);
    proposals.push({
      scenarioId: scenario.id,
      scenarioJson: result.scenario ? JSON.stringify(result.scenario, null, 2) : null,
      attempts: result.attempts,
      feedback: result.feedback,
      error: result.error,
    });
  }
  return { proposals, staleCount: proposals.length };
}
