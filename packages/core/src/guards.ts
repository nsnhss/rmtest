/**
 * 本包规范守卫模块：跨模块复用的运行时类型判定。
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
