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
