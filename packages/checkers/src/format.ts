/** 引用位置的人类可读格式 */
import type { RefLocation } from "@rmtest/core";

const DATA_LABELS: Record<string, string> = {
  system: "系统",
  actor: "角色",
  commonEvent: "公共事件",
  tileset: "图块集",
  enemy: "敌人",
  animation: "动画",
  troop: "战斗队伍",
  item: "道具",
};

export function formatLocation(loc: RefLocation): string {
  const parts: string[] = [];
  if (loc.mapId) parts.push(`地图 ${loc.mapId}`);
  if (loc.eventId) parts.push(`事件 ${loc.eventId}`);
  if (loc.pageIndex !== undefined) parts.push(`页 ${loc.pageIndex + 1}`);
  if (loc.commandIndex !== undefined) parts.push(`命令 ${loc.commandIndex}`);
  if (loc.dataKey && loc.dataId) parts.push(`${DATA_LABELS[loc.dataKey] ?? loc.dataKey} ${loc.dataId}`);
  return parts.length > 0 ? parts.join(" · ") : "未知位置";
}
