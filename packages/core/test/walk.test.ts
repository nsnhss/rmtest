import { describe, expect, it } from "vitest";
import { Cmd, type IRCommand } from "../src/ir.ts";
import { walkCommands } from "../src/walk.ts";

const cmds = (list: Array<[number, number, unknown[]]>): IRCommand[] =>
  list.map(([code, indent, parameters]) => ({ code, indent, parameters }));

describe("命令遍历器（嵌套分支）", () => {
  it("按缩进递归进入条件分支体", () => {
    const commands = cmds([
      [Cmd.ShowText, 0, []],
      [Cmd.ConditionalBranch, 0, [0, 5]],
      [Cmd.ControlSwitches, 1, [12, 12, 0]],
      [Cmd.ConditionalBranch, 1, [1, 3, 0, 0]],
      [Cmd.TransferPlayer, 2, [99, 1, 1, 0, 0]],
      [Cmd.CallCommonEvent, 0, [7]],
    ]);

    const visited: Array<{ code: number; depth: number; index: number }> = [];
    walkCommands(commands, { mapId: 1, eventId: 1, pageIndex: 0 }, (cmd, loc, depth) => {
      visited.push({ code: cmd.code, depth, index: loc.commandIndex });
    });

    expect(visited).toEqual([
      { code: Cmd.ShowText, depth: 0, index: 0 },
      { code: Cmd.ConditionalBranch, depth: 0, index: 1 },
      { code: Cmd.ControlSwitches, depth: 1, index: 2 },
      { code: Cmd.ConditionalBranch, depth: 1, index: 3 },
      { code: Cmd.TransferPlayer, depth: 2, index: 4 },
      { code: Cmd.CallCommonEvent, depth: 0, index: 5 },
    ]);
  });

  it("条件分支体后的外层命令不被吞掉", () => {
    const commands = cmds([
      [Cmd.ConditionalBranch, 0, [0, 1]],
      [Cmd.ControlSwitches, 1, [1, 1, 0]],
      [Cmd.ControlVariables, 0, [1, 1, 0]],
    ]);
    const visited: number[] = [];
    walkCommands(commands, {}, (cmd) => visited.push(cmd.code));
    expect(visited).toEqual([Cmd.ConditionalBranch, Cmd.ControlSwitches, Cmd.ControlVariables]);
  });

  it("空列表与空页安全", () => {
    const visited: number[] = [];
    walkCommands([], {}, (cmd) => visited.push(cmd.code));
    expect(visited).toEqual([]);
  });
});
