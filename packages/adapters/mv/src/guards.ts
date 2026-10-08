/**
 * 类型守卫 —— 本包的规范守卫模块。
 * 解析对象是磁盘上的未受信 JSON（用户游戏数据），形状不可信：
 * 字段级别用这些守卫访问，坏数据不崩解析器。
 */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function truthy(v: unknown): boolean {
  return v === true || v === 1;
}

export function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
