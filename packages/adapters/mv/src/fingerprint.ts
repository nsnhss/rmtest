/**
 * 工程内容指纹 —— sha256 树。
 * 时效性引擎（fresh/broken/stale 三分类）的地基：测试绑定与游戏版本都靠它。
 */
import { createHash } from "node:crypto";

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export function hashString(s: string): string {
  return hashBytes(new TextEncoder().encode(s));
}

/** 内容哈希树：sorted("relPath:fileHash") 拼接再哈希 */
export function fingerprintTree(files: ReadonlyMap<string, string>): string {
  const entries = [...files.entries()].map(([p, h]) => `${p}:${h}`).sort();
  return hashString(entries.join("\n"));
}
