/**
 * 生命周期 facts —— 开关/变量/独立开关的全集读写点。
 * P2 语义检查（条件恒假、死逻辑、状态污染）的地基。
 *
 * 语义约定：
 * - read  = 条件判断/触发条件（值影响分支）
 * - write = 赋值（121/122/123）
 * - 脚本调用（355/655）不解析 —— 相关检查器须在消息中注明"不含脚本"
 */
import { Cmd, type IRDocument } from "../ir.ts";
import type { RefLocation } from "./refgraph.ts";
import { walkCommands } from "../walk.ts";

export interface SwitchUse {
  reads: RefLocation[];
  writes: RefLocation[];
}

export interface Lifecycle {
  switches: Map<number, SwitchUse>;
  variables: Map<number, SwitchUse>;
  /** key = "mapId:eventId:ch" */
  selfSwitches: Map<string, SwitchUse>;
}

export function buildLifecycle(ir: IRDocument): Lifecycle {
  const switches = new Map<number, SwitchUse>();
  const variables = new Map<number, SwitchUse>();
  const selfSwitches = new Map<string, SwitchUse>();

  const use = <K>(map: Map<K, SwitchUse>, key: K): SwitchUse => {
    let u = map.get(key);
    if (!u) {
      u = { reads: [], writes: [] };
      map.set(key, u);
    }
    return u;
  };
  const read = <K>(map: Map<K, SwitchUse>, key: K, loc: RefLocation) => use(map, key).reads.push(loc);
  const write = <K>(map: Map<K, SwitchUse>, key: K, loc: RefLocation) => use(map, key).writes.push(loc);

  const collect = (cmdCode: number, params: unknown[], loc: RefLocation) => {
    switch (cmdCode) {
      case Cmd.ControlSwitches:
        for (let id = Number(params[0]); id <= Number(params[1]); id++) write(switches, id, loc);
        break;
      case Cmd.ControlVariables:
        for (let id = Number(params[0]); id <= Number(params[1]); id++) write(variables, id, loc);
        break;
      case Cmd.ControlSelfSwitch:
        if (loc.mapId && loc.eventId) write(selfSwitches, `${loc.mapId}:${loc.eventId}:${String(params[0])}`, loc);
        break;
      case Cmd.TransferPlayer:
        // mode 1/2 = 变量指定传送目标 → 变量读取
        if (Number(params[0]) === 1) read(variables, Number(params[1]), loc);
        else if (Number(params[0]) === 2) {
          read(variables, Number(params[1]), loc);
          read(variables, Number(params[2]), loc);
        }
        break;
      case Cmd.BattleProcessing:
        if (Number(params[0]) !== 0) read(variables, Number(params[1]), loc);
        break;
      case Cmd.ConditionalBranch: {
        const type = Number(params[0]);
        if (type === 0) read(switches, Number(params[1]), loc);
        else if (type === 1) read(variables, Number(params[1]), loc);
        break;
      }
      default:
        break;
    }
  };

  for (const map of ir.maps) {
    for (const ev of map.events) {
      for (const page of ev.pages) {
        const pageLoc: RefLocation = { mapId: map.id, eventId: ev.id, pageIndex: page.index };
        const c = page.conditions;
        if (c.switch1Id) read(switches, c.switch1Id, pageLoc);
        if (c.switch2Id) read(switches, c.switch2Id, pageLoc);
        if (c.variableId) read(variables, c.variableId, pageLoc);
        if (c.selfSwitchCh) read(selfSwitches, `${map.id}:${ev.id}:${c.selfSwitchCh}`, pageLoc);
        walkCommands(page.commands, pageLoc, (cmd, loc) => collect(cmd.code, cmd.parameters, loc));
      }
    }
  }

  for (const ce of ir.commonEvents) {
    const loc: RefLocation = { dataKey: "commonEvent", dataId: ce.id };
    if (ce.trigger === 2 && ce.switchId) read(switches, ce.switchId, loc);
    walkCommands(ce.commands, loc, (cmd, cmdLoc) => collect(cmd.code, cmd.parameters, cmdLoc));
  }

  return { switches, variables, selfSwitches };
}
