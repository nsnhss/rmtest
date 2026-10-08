/**
 * Stale 修复提案 —— 过时场景的 AI 更新。
 * 输入：旧场景（保留测试意图）+ 当前游戏表面；输出：过闸门的更新版场景。
 * AI 只做提案；终审仍是人（提案过校验闸门后 diff 给人看）。
 */
import type { GameUniverse, IRDocument } from "@rmtest/core";
import type { Scenario } from "@rmtest/dsl";
import { generateScenario, type GenerateOptions, type GenerateResult } from "./generate.ts";
import type { ChatProvider } from "./provider.ts";
import type { GameSurface } from "./surface.ts";

export async function repairScenario(
  stale: Scenario,
  surface: GameSurface,
  ir: IRDocument,
  universe: GameUniverse,
  provider: ChatProvider,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  // 复用闸门循环：把"过时场景 + 意图保持"包装成自然语言需求
  const nl = [
    "以下是一个已过时的自动化测试场景（游戏内容有变化）。",
    "请生成保持其测试意图的更新版场景：步骤结构不变，引用改为当前游戏表面中存在的实体。",
    "",
    `旧场景 JSON:\n${JSON.stringify(stale, null, 2)}`,
  ].join("\n");
  return generateScenario(nl, surface, ir, universe, provider, opts);
}
