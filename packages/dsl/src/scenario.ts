/**
 * 场景 DSL —— 自动化测试的唯一输入契约。
 * 每步可解析、可校验、可执行、可记录轨迹。AI 生成/AI 校验/时效性检测全部吃这个 schema。
 */
import { z } from "zod";

const WalkStep = z.object({
  type: z.literal("walk"),
  to: z.object({ map: z.number().int().positive(), x: z.number().int().min(0), y: z.number().int().min(0) }),
});

export const StepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start_new_game") }),
  WalkStep,
  z.object({ type: z.literal("interact"), direction: z.enum(["up", "down", "left", "right"]) }),
  z.object({ type: z.literal("choose"), index: z.number().int().min(0) }),
  z.object({ type: z.literal("assert_switch"), switchId: z.number().int().positive(), value: z.boolean() }),
  z.object({ type: z.literal("assert_variable"), variableId: z.number().int().positive(), value: z.number() }),
  z.object({ type: z.literal("assert_map"), map: z.number().int().positive() }),
]);

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  /** 创建时对应的游戏内容指纹（可选；时效性引擎用） */
  game_fingerprint: z.string().optional(),
  steps: z.array(StepSchema).min(1),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioStep = z.infer<typeof StepSchema>;
export type WalkStep = z.infer<typeof WalkStep>;
