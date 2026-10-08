/**
 * CLI explain —— 失败轨迹 → AI 翻译成 bug 报告。
 * bug 是确定性执行器找出来的；这里只做翻译。
 */
import type { ChatProvider, FailureTrace } from "@rmtest/ai";
import { summarizeFailure } from "@rmtest/ai";

export function explainFailure(trace: FailureTrace, provider: ChatProvider): Promise<string> {
  return summarizeFailure(trace, provider);
}
