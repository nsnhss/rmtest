/**
 * 事件命令遍历器 —— 处理 MV 的扁平列表 + 缩进嵌套结构。
 * 条件分支(111)的体 = 后续 indent 更大的命令，直到 indent 回落到 <= 分支缩进。
 */
import { Cmd, type IRCommand } from "./ir.ts";

export interface CommandLocation {
  mapId?: number;
  eventId?: number;
  pageIndex?: number;
  /** 数据库来源，如 "commonEvent" */
  dataKey?: string;
  dataId?: number;
}

export type LocatedCommand = CommandLocation & { commandIndex: number };

export function walkCommands(
  commands: IRCommand[],
  baseLoc: CommandLocation,
  visit: (cmd: IRCommand, loc: LocatedCommand, depth: number) => void,
): void {
  walkSlice(commands, 0, 0, baseLoc, visit, 0);
}

/** 从 start 起处理 indent 层的命令，返回下一条属于外层命令的下标 */
function walkSlice(
  commands: IRCommand[],
  start: number,
  indent: number,
  loc: CommandLocation,
  visit: (cmd: IRCommand, loc: LocatedCommand, depth: number) => void,
  depth: number,
): number {
  let i = start;
  while (i < commands.length) {
    const cmd = commands[i]!;
    if (cmd.indent < indent) return i;
    visit(cmd, { ...loc, commandIndex: i }, depth);
    if (cmd.code === Cmd.ConditionalBranch) {
      i = walkSlice(commands, i + 1, indent + 1, loc, visit, depth + 1);
    } else {
      i++;
    }
  }
  return i;
}
