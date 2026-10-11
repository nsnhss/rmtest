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
  /** 多语言目录键（见 @rmtest/i18n）；缺失时用 message（中文原文） */
  messageId?: string;
  /** 目录键占位符参数；值本身也可以是可本地化文本（如 kind=开关/switch） */
  messageParams?: Record<string, string | number | LocalizableText>;
  evidence?: unknown;
}

/** 与 @rmtest/i18n 的 LocalizableMessage 结构一致（core 不依赖 i18n，此处重复声明结构） */
export interface LocalizableText {
  message: string;
  messageId?: string;
  messageParams?: Record<string, string | number | LocalizableText>;
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

/**
 * 位置描述的文案模板（多语言）：核心只管拼装，文案由调用方注入。
 * 模板占位符：{id} / {index}。
 */
export interface LocationLabels {
  map: string;
  event: string;
  page: string;
  command: string;
  unknown: string;
  sep: string;
  data: Record<string, string>;
}

const ZH_LOCATION_LABELS: LocationLabels = {
  map: "地图 {id}",
  event: "事件 {id}",
  page: "页 {index}",
  command: "命令 {index}",
  unknown: "未知位置",
  sep: " · ",
  data: DATA_LABELS,
};

function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** 报告位置的人类可读格式，如 "地图 1 · 事件 5 · 页 2 · 命令 3" */
export function formatLocation(loc: ReportLocation | undefined, labels: LocationLabels = ZH_LOCATION_LABELS): string {
  if (!loc) return labels.unknown;
  const parts: string[] = [];
  if (loc.mapId) parts.push(fill(labels.map, { id: loc.mapId }));
  if (loc.eventId) parts.push(fill(labels.event, { id: loc.eventId }));
  if (loc.pageIndex !== undefined) parts.push(fill(labels.page, { index: loc.pageIndex + 1 }));
  if (loc.commandIndex !== undefined) parts.push(fill(labels.command, { index: loc.commandIndex }));
  if (loc.dataKey && loc.dataId) {
    parts.push(`${labels.data[loc.dataKey] ?? loc.dataKey} ${loc.dataId}`);
  }
  return parts.length > 0 ? parts.join(labels.sep) : labels.unknown;
}
