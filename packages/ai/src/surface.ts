/**
 * 游戏表面 —— 喂给 AI 的"词汇表"。
 * AI 只允许引用这里存在的实体；超长列表截断并注明（大游戏不能全量塞进上下文）。
 */
import type { IRDocument } from "@rmtest/core";

export interface GameSurface {
  maps: Array<{ id: number; name: string; width: number; height: number }>;
  switches: Array<{ id: number; name: string }>;
  variables: Array<{ id: number; name: string }>;
  items: Array<{ id: number; name: string }>;
  commonEvents: Array<{ id: number; name: string }>;
  truncated: string[];
}

const MAX_ENTRIES = 300;

function cap<T>(list: T[], label: string, truncated: string[]): T[] {
  if (list.length <= MAX_ENTRIES) return list;
  truncated.push(`${label} 共 ${list.length} 个，仅提供前 ${MAX_ENTRIES} 个`);
  return list.slice(0, MAX_ENTRIES);
}

export function buildGameSurface(ir: IRDocument): GameSurface {
  const truncated: string[] = [];
  return {
    maps: cap(
      ir.maps.map((m) => ({ id: m.id, name: m.name, width: m.width, height: m.height })),
      "地图",
      truncated,
    ),
    switches: cap(
      ir.system.switches.map((name, id) => ({ id, name })).filter((s) => s.id > 0),
      "开关",
      truncated,
    ),
    variables: cap(
      ir.system.variables.map((name, id) => ({ id, name })).filter((s) => s.id > 0),
      "变量",
      truncated,
    ),
    items: cap(
      ir.items.map((i) => ({ id: i.id, name: i.name })),
      "道具",
      truncated,
    ),
    commonEvents: cap(
      ir.commonEvents.map((e) => ({ id: e.id, name: e.name })),
      "公共事件",
      truncated,
    ),
    truncated,
  };
}
