/**
 * 插件加载器 —— 从目录动态加载用户自写的 checker（.ts/.js）。
 * 契约：文件默认导出 CheckerPlugin 或 CheckerPlugin[]；manifest 缺失/不合法记入 errors，不崩加载器。
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CheckerPlugin } from "@rmtest/core";

export interface LoadedCheckers {
  checkers: CheckerPlugin[];
  errors: { file: string; message: string }[];
}

function isCheckerPlugin(v: unknown): v is CheckerPlugin {
  if (typeof v !== "object" || v === null) return false;
  const c = v as { manifest?: unknown; check?: unknown };
  const m = c.manifest as { name?: unknown; version?: unknown; irVersion?: unknown; facts?: unknown } | undefined;
  return (
    typeof c.check === "function" &&
    typeof m === "object" &&
    m !== null &&
    typeof m.name === "string" &&
    typeof m.version === "string" &&
    typeof m.irVersion === "number" &&
    Array.isArray(m.facts)
  );
}

export async function loadCheckersFromDir(dir: string): Promise<LoadedCheckers> {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
  } catch (err) {
    return { checkers: [], errors: [{ file: dir, message: `目录不可读: ${err instanceof Error ? err.message : String(err)}` }] };
  }

  const checkers: CheckerPlugin[] = [];
  const errors: LoadedCheckers["errors"] = [];

  for (const file of files) {
    try {
      // 例外（ts-no-dynamic-import）：插件来自运行时目录，作者期不可知，静态导入不可能
      const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as Record<string, unknown>;
      const candidates: unknown[] = Array.isArray(mod["default"]) ? (mod["default"] as unknown[]) : [mod["default"]];
      for (const c of candidates) {
        if (!isCheckerPlugin(c)) {
          errors.push({ file, message: "默认导出不是合法的 CheckerPlugin（需 manifest{name,version,irVersion,facts} + check 函数）" });
          continue;
        }
        checkers.push(c);
      }
    } catch (err) {
      errors.push({ file, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { checkers, errors };
}
