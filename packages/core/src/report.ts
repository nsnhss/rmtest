/**
 * 类型化报告 section —— 所有检查器/探针的统一输出契约。
 * UI 按 type 渲染，未知类型优雅降级；location 供编辑器跳转。
 */
export interface ReportSection {
  /** section 类型，如 "dangling-ref" / "softlock-candidate" / "screenshot-diff" */
  type: string;
  severity: "error" | "warning" | "info";
  confidence: "high" | "medium" | "low";
  location?: ReportLocation;
  message: string;
  evidence?: unknown;
}

export interface ReportLocation {
  mapId?: number;
  eventId?: number;
  pageIndex?: number;
  commandIndex?: number;
  /** 数据库条目定位：actors/items/skills 等 */
  dataKey?: string;
  dataId?: number;
}

const DATA_LABELS: Record<string, string> = {
  system: "系统",
  actor: "角色",
  commonEvent: "公共事件",
  tileset: "图块集",
  enemy: "敌人",
  animation: "动画",
  troop: "战斗队伍",
  item: "道具",
  skill: "技能",
};

/** 报告位置的人类可读格式，如 "地图 1 · 事件 5 · 页 2 · 命令 3" */
export function formatLocation(loc: ReportLocation | undefined): string {
  if (!loc) return "未知位置";
  const parts: string[] = [];
  if (loc.mapId) parts.push(`地图 ${loc.mapId}`);
  if (loc.eventId) parts.push(`事件 ${loc.eventId}`);
  if (loc.pageIndex !== undefined) parts.push(`页 ${loc.pageIndex + 1}`);
  if (loc.commandIndex !== undefined) parts.push(`命令 ${loc.commandIndex}`);
  if (loc.dataKey && loc.dataId) parts.push(`${DATA_LABELS[loc.dataKey] ?? loc.dataKey} ${loc.dataId}`);
  return parts.length > 0 ? parts.join(" · ") : "未知位置";
}
