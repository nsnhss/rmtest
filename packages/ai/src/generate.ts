/**
 * NL → DSL 场景生成 —— 沙漏结构的 AI 侧。
 * 三条机制钉死边界：
 * 1. 窄接口：AI 只输出场景 JSON，没有"帮我找 bug"端点。
 * 2. 校验闸门：schema + 引用校验（validateScenario）不过就带着具体错误打回重写。
 * 3. 判定隔离：本模块只产场景；执行与判定在确定性的 runtime 里，AI 不参与。
 */
import { type GameUniverse, type IRDocument } from "@rmtest/core";
import { ScenarioSchema, validateScenario, type Scenario } from "@rmtest/dsl";
import type { ChatMessage, ChatProvider } from "./provider.ts";
import type { GameSurface } from "./surface.ts";

export interface GenerateOptions {
  maxAttempts?: number;
}

export interface GenerateResult {
  scenario: Scenario | null;
  attempts: number;
  /** 打回重写的反馈记录（每次失败的具体错误） */
  feedback: string[];
  error: string | null;
}

const SYSTEM_PROMPT = `你是游戏自动化测试场景生成器。只输出 JSON，不要任何解释、注释或 markdown 代码块。

场景 schema（字段不可增删）：
{
  "id": "场景标识字符串",
  "steps": [ 步骤按顺序执行 ]
}

步骤类型（type 字段唯一标识）：
- {"type":"start_new_game"} —— 开始新游戏（场景第一步必须是它）
- {"type":"walk","to":{"map":地图ID,"x":X坐标,"y":Y坐标}} —— 走到地图某格
- {"type":"interact","direction":"up"} —— 面向方向交互（up/down/left/right）
- {"type":"choose","index":选项序号} —— 选择对话选项
- {"type":"assert_switch","switchId":开关ID,"value":true} —— 断言开关值
- {"type":"assert_variable","variableId":变量ID,"value":数字} —— 断言变量值
- {"type":"assert_map","map":地图ID} —— 断言所在/传送目标地图

硬约束：
1. 地图 ID、开关 ID、变量 ID、道具 ID 只能引用下面"游戏表面"里列出的实体。
2. walk 的 x/y 必须在地图宽高范围内（0 <= x < 宽度，0 <= y < 高度）。
3. 坐标从 0 开始。
4. 输出必须是合法 JSON 对象，以 { 开头以 } 结尾。`;

function extractJson(text: string): string | null {
  const stripped = text.replace(/```json|```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return stripped.slice(start, end + 1);
}

export async function generateScenario(
  nl: string,
  surface: GameSurface,
  ir: IRDocument,
  universe: GameUniverse,
  provider: ChatProvider,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `游戏表面（只能引用这些实体）:\n${JSON.stringify(surface)}\n\n测试需求（自然语言）:\n${nl}\n\n请生成场景 JSON。`,
    },
  ];

  const feedback: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await provider.chat(messages, { temperature: 0.2 });
    messages.push({ role: "assistant", content: reply });

    const json = extractJson(reply);
    if (json === null) {
      const msg = `第 ${attempt} 次：回复不是 JSON`;
      feedback.push(msg);
      messages.push({ role: "user", content: `${msg}。请只输出 JSON 对象。` });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      const msg = `第 ${attempt} 次：JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`;
      feedback.push(msg);
      messages.push({ role: "user", content: `${msg}。请修正为合法 JSON。` });
      continue;
    }

    const schema = ScenarioSchema.safeParse(parsed);
    if (!schema.success) {
      const issues = schema.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      const msg = `第 ${attempt} 次：schema 校验失败: ${issues}`;
      feedback.push(msg);
      messages.push({ role: "user", content: `${msg}。请按 schema 修正后重新输出完整 JSON。` });
      continue;
    }

    const validation = validateScenario(schema.data, ir, universe);
    if (!validation.ok) {
      const issues = validation.issues.map((i) => i.message).join("; ");
      const msg = `第 ${attempt} 次：引用校验失败: ${issues}`;
      feedback.push(msg);
      messages.push({ role: "user", content: `${msg}。只能引用游戏表面里存在的实体。请重新输出完整 JSON。` });
      continue;
    }

    return { scenario: schema.data, attempts: attempt, feedback, error: null };
  }

  return { scenario: null, attempts: maxAttempts, feedback, error: feedback[feedback.length - 1] ?? "未知错误" };
}
