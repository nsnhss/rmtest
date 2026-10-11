/**
 * 传送软锁检查 —— 传送目标/开局点的可站立性。
 * 判定（确定性，flags 未知时跳过不猜）：
 * 1. 目标坐标在地图外 → 硬错误
 * 2. 目标格子四向全阻挡 → 卡死在墙里
 * 3. 目标格子可站但四周均不可走 → 无法离开
 */
import { Cmd, type CheckerPlugin, type CommandLocation, type IRCommand, type IRDocument, type IRMap, type IRTileset, type ReportSection } from "@rmtest/core";
import { walkCommands } from "@rmtest/core";
import type { LocalizableMessage } from "@rmtest/i18n";
import { core } from "../i18n/core.ts";

const BLOCKED = 0xf;

/** 四向阻挡位：0x1 下 0x2 左 0x4 右 0x8 上；0x10 = 星号（通行无关，视为不可走） */
function passable(flags: number[], tileId: number): boolean | null {
  if (tileId < 0 || tileId >= flags.length) return null;
  const flag = flags[tileId]!;
  if ((flag & 0x10) !== 0) return false;
  return (flag & BLOCKED) !== BLOCKED;
}

function flagsFor(ir: IRDocument, map: IRMap): number[] {
  return ir.tilesets.find((t) => t.id === map.tilesetId)?.flags ?? [];
}

function checkTarget(
  ir: IRDocument,
  mapId: number,
  x: number,
  y: number,
  location: ReportSection["location"],
  what: LocalizableMessage,
  sections: ReportSection[],
): void {
  const map = ir.maps.find((m) => m.id === mapId);
  if (!map) return; // 悬空地图由 dangling-ref 报

  if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
    sections.push({
      type: "transfer-softlock",
      severity: "error",
      confidence: "high",
      location,
      ...core("checker.core.transferOutOfBounds", { what, x, y, mapId, width: map.width, height: map.height }),
      evidence: { mapId, x, y, width: map.width, height: map.height },
    });
    return;
  }

  if (map.data.length < map.width * map.height) return; // 数据残缺，跳过
  const flags = flagsFor(ir, map);
  const tileId = map.data[y * map.width + x]!;
  const self = passable(flags, tileId);
  if (self === null) return; // flags 缺失，无法判定

  if (!self) {
    sections.push({
      type: "transfer-softlock",
      severity: "error",
      confidence: "high",
      location,
      ...core("checker.core.transferBlockedTile", { what, x, y }),
      evidence: { mapId, x, y, tileId },
    });
    return;
  }

  // 四周检查：四个邻居都不可走或出界 → 无法离开
  const neighbors: Array<[number, number]> = [
    [x, y + 1],
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
  ];
  let escape = false;
  for (const [nx, ny] of neighbors) {
    if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue; // 出界视为阻挡
    const nTile = map.data[ny * map.width + nx]!;
    if (passable(flags, nTile) !== false) {
      escape = true;
      break;
    }
  }
  if (!escape) {
    sections.push({
      type: "transfer-softlock",
      severity: "warning",
      confidence: "medium",
      location,
      ...core("checker.core.transferNoEscape", { what, x, y }),
      evidence: { mapId, x, y },
    });
  }
}

export const transferSoftlockChecker: CheckerPlugin = {
  manifest: { name: "transfer-softlock", version: "0.1.0", irVersion: 1, facts: [] },
  check(_facts, ir: IRDocument) {
    const sections: ReportSection[] = [];

    // 开局点
    const sys = ir.system;
    checkTarget(ir, sys.startMapId, sys.startX, sys.startY, { dataKey: "system" }, core("checker.core.what.start"), sections);

    // 全部传送命令（地图事件 + 公共事件）
    const scanTransfers = (commands: IRCommand[], loc: CommandLocation) => {
      walkCommands(commands, loc, (cmd, cmdLoc) => {
        if (cmd.code !== Cmd.TransferPlayer) return;
        // 真实格式: [mode, mapId, x, y, dir, fade]；变量指定（mode≠0）静态无法判定，跳过
        if (Number(cmd.parameters[0]) !== 0) return;
        const mapId = Number(cmd.parameters[1]);
        const x = Number(cmd.parameters[2]);
        const y = Number(cmd.parameters[3]);
        if (!Number.isFinite(mapId) || !Number.isFinite(x) || !Number.isFinite(y)) return;
        checkTarget(ir, mapId, x, y, cmdLoc, core("checker.core.what.transfer"), sections);
      });
    };

    for (const map of ir.maps) {
      for (const ev of map.events) {
        for (const page of ev.pages) scanTransfers(page.commands, { mapId: map.id, eventId: ev.id, pageIndex: page.index });
      }
    }
    for (const ce of ir.commonEvents) scanTransfers(ce.commands, { dataKey: "commonEvent", dataId: ce.id });
    return sections;
  },
};
