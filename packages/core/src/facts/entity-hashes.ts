/**
 * 实体内容哈希 —— 开关/变量的"写入签名"。
 * 文件级哈希只能定位地图文件；个体粒度重链需要"谁在写这个开关、怎么写的"。
 */
import { createHash } from "node:crypto";
import { Cmd, type IRDocument } from "../ir.ts";
import { walkCommands } from "../walk.ts";

function sig(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);
}

function collectSwitchWrites(ir: IRDocument, switchId: number): string[] {
  const parts: string[] = [];
  const visit = (cmdCode: number, params: unknown[], loc: { mapId?: number; eventId?: number; pageIndex?: number; dataKey?: string; dataId?: number; commandIndex?: number }) => {
    if (cmdCode !== Cmd.ControlSwitches) return;
    const start = Number(params[0]);
    const end = Number(params[1]);
    if (switchId < start || switchId > end) return;
    parts.push(
      `${loc.mapId ?? 0}:${loc.eventId ?? 0}:${loc.pageIndex ?? -1}:${loc.dataKey ?? ""}:${loc.dataId ?? 0}:${JSON.stringify(params)}`,
    );
  };
  for (const map of ir.maps) {
    for (const ev of map.events) {
      for (const page of ev.pages) {
        walkCommands(page.commands, { mapId: map.id, eventId: ev.id, pageIndex: page.index }, (cmd, loc) =>
          visit(cmd.code, cmd.parameters, loc),
        );
      }
    }
  }
  for (const ce of ir.commonEvents) {
    walkCommands(ce.commands, { dataKey: "commonEvent", dataId: ce.id }, (cmd, loc) =>
      visit(cmd.code, cmd.parameters, loc),
    );
  }
  return parts;
}

/** 单个开关的写入签名；从未被写入 → null */
export function switchWriteSignature(ir: IRDocument, switchId: number): string | null {
  const parts = collectSwitchWrites(ir, switchId);
  return parts.length > 0 ? sig(parts) : null;
}

/** 全部被写入开关的签名表 */
export function switchHashes(ir: IRDocument): Map<number, string> {
  const out = new Map<number, string>();
  for (const map of ir.maps) {
    for (const ev of map.events) {
      for (const page of ev.pages) {
        walkCommands(page.commands, {}, (cmd) => {
          if (cmd.code !== Cmd.ControlSwitches) return;
          for (let id = Number(cmd.parameters[0]); id <= Number(cmd.parameters[1]); id++) {
            if (!out.has(id)) {
              const h = switchWriteSignature(ir, id);
              if (h) out.set(id, h);
            }
          }
        });
      }
    }
  }
  return out;
}
