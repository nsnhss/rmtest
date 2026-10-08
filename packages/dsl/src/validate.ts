/**
 * 场景校验闸门 —— 引用的地图/坐标/开关/变量必须真实存在。
 * AI 生成与人工编写的场景都必须过这道门才能执行；非法引用带着具体错误打回。
 */
import type { GameUniverse, IRDocument } from "@rmtest/core";
import type { Scenario } from "./scenario.ts";

export interface ValidationIssue {
  stepIndex: number;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function validateScenario(scenario: Scenario, ir: IRDocument, universe: GameUniverse): ValidationResult {
  const issues: ValidationIssue[] = [];

  scenario.steps.forEach((step, i) => {
    switch (step.type) {
      case "walk": {
        const map = ir.maps.find((m) => m.id === step.to.map);
        if (!map) {
          issues.push({ stepIndex: i, message: `第 ${i + 1} 步引用的地图 ${step.to.map} 不存在` });
          break;
        }
        if (step.to.x >= map.width || step.to.y >= map.height) {
          issues.push({
            stepIndex: i,
            message: `第 ${i + 1} 步坐标 (${step.to.x}, ${step.to.y}) 超出地图 ${step.to.map}（${map.width}×${map.height}）`,
          });
        }
        break;
      }
      case "assert_switch":
        if (step.switchId >= universe.switchCount) {
          issues.push({ stepIndex: i, message: `第 ${i + 1} 步引用的开关 ${step.switchId} 不存在` });
        }
        break;
      case "assert_variable":
        if (step.variableId >= universe.variableCount) {
          issues.push({ stepIndex: i, message: `第 ${i + 1} 步引用的变量 ${step.variableId} 不存在` });
        }
        break;
      case "assert_map":
        if (!universe.maps.has(step.map)) {
          issues.push({ stepIndex: i, message: `第 ${i + 1} 步引用的地图 ${step.map} 不存在` });
        }
        break;
      default:
        break;
    }
  });

  return { ok: issues.length === 0, issues };
}
