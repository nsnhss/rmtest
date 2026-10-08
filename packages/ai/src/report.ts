/**
 * 失败轨迹 → 人类可读 bug 报告翻译。
 * bug 是确定性执行器找出来的（断言失败 + 轨迹），AI 只把轨迹翻译成话。
 * 输入是机器可验证的事实，输出是 prose —— 判定与翻译物理隔离。
 */
import type { ChatProvider } from "./provider.ts";

export interface FailureTrace {
  scenarioId: string;
  stepResults: Array<{ index: number; type: string; passed: boolean; message?: string }>;
  finalSnapshot: unknown;
}

const REPORT_PROMPT = `你是游戏测试报告翻译员。下面是自动化测试的失败轨迹（机器生成的事实）。请用中文写一段简洁的 bug 报告：
1. 场景想验证什么（从步骤类型推断）
2. 哪一步失败了、断言期望与实际值
3. 对开发者排查最有用的下一步建议
不要编造轨迹里没有的信息。`;

export async function summarizeFailure(trace: FailureTrace, provider: ChatProvider): Promise<string> {
  return provider.chat(
    [
      { role: "system", content: REPORT_PROMPT },
      { role: "user", content: JSON.stringify(trace) },
    ],
    { temperature: 0.3 },
  );
}
