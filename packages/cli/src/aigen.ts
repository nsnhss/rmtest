/**
 * CLI aigen —— AI 生成测试场景。
 * 沙漏入口：NL + 游戏表面 → AI → 校验闸门 → 场景 JSON（绝不执行）。
 * 输出带 feedback 记录，供观察模型被打回了几次。
 */
import { loadProject } from "@rmtest/adapter-mv";
import { buildGameSurface, generateScenario, OllamaProvider, type ChatProvider } from "@rmtest/ai";

export interface AigenOutcome {
  scenarioJson: string | null;
  attempts: number;
  feedback: string[];
  error: string | null;
}

export async function aigen(
  projectDir: string,
  nl: string,
  provider: ChatProvider,
  opts: { maxAttempts?: number } = {},
): Promise<AigenOutcome> {
  const loaded = loadProject(projectDir);
  const surface = buildGameSurface(loaded.ir);
  const result = await generateScenario(nl, surface, loaded.ir, loaded.universe, provider, opts);
  return {
    scenarioJson: result.scenario ? JSON.stringify(result.scenario, null, 2) : null,
    attempts: result.attempts,
    feedback: result.feedback,
    error: result.error,
  };
}

export function defaultProvider(): ChatProvider {
  const url = process.env["OLLAMA_URL"] ?? "http://127.0.0.1:11434";
  const model = process.env["OLLAMA_MODEL"] ?? "qwen3:1.7b";
  return new OllamaProvider(url, model);
}
