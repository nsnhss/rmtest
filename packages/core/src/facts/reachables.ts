/**
 * 可达事件页全集 —— 覆盖度的静态分母，也是"新内容检测"的基线来源。
 * 可达 = 从开局地图沿传送图 BFS 能到的地图；其上全部事件页构成覆盖义务。
 */
import { Cmd, type IRDocument } from "../ir.ts";
import { walkCommands } from "../walk.ts";

/** 可达地图 ID 全集：从开局地图沿传送图 BFS（地图级，不依赖事件页） */
export function reachableMapIds(ir: IRDocument): Set<number> {
  const edges = new Map<number, number[]>();
  for (const m of ir.maps) edges.set(m.id, []);
  for (const m of ir.maps) {
    for (const ev of m.events) {
      for (const p of ev.pages) {
        walkCommands(p.commands, {}, (cmd) => {
          if (cmd.code !== Cmd.TransferPlayer) return;
          // 真实格式 mode 0 = 直接指定地图
          if (Number(cmd.parameters[0]) !== 0) return;
          const target = Number(cmd.parameters[1]);
          if (Number.isFinite(target) && edges.has(target)) edges.get(m.id)!.push(target);
        });
      }
    }
  }

  const visited = new Set<number>();
  const queue = [ir.system.startMapId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(edges.get(id) ?? []));
  }
  return visited;
}

export function reachablePageKeys(ir: IRDocument): string[] {
  const visited = reachableMapIds(ir);

  const keys: string[] = [];
  for (const m of ir.maps) {
    if (!visited.has(m.id)) continue;
    for (const ev of m.events) {
      for (const p of ev.pages) keys.push(`${m.id}:${ev.id}:${p.index}`);
    }
  }
  return keys.sort();
}

export interface ContentDiff {
  added: string[];
  removed: string[];
}

/** 新增内容 = 当前有、基线没有；删除内容 = 基线有、当前没有 */
export function diffContentKeys(prev: readonly string[], current: readonly string[]): ContentDiff {
  const prevSet = new Set(prev);
  const curSet = new Set(current);
  return {
    added: current.filter((k) => !prevSet.has(k)).sort(),
    removed: prev.filter((k) => !curSet.has(k)).sort(),
  };
}
