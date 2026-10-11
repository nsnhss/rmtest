/**
 * 插件加载器 —— 从目录动态加载用户自写的 checker（.ts/.js）。
 * 契约：文件默认导出 CheckerPlugin 或 CheckerPlugin[]；
 * 加载时做兼容闸门（irVersion 必须在 1..IR_SCHEMA_VERSION 内），
 * manifest 缺失/不合法记入 errors 并附 messageId（可本地化），不崩加载器。
 *
 * 安全边界：目录由用户显式指定，其中的文件会被真实 import（= 执行其代码）。
 * 只指向你信任的插件目录，不要指向游戏工程目录。
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { IR_SCHEMA_VERSION, type CheckerPlugin } from "@rmtest/core";
import { loadMsg } from "./i18n/loader.ts";
import type { LocalizableMessage } from "@rmtest/i18n";

export type CheckerLoadError = LocalizableMessage & { file: string };

export interface LoadedCheckers {
  checkers: CheckerPlugin[];
  errors: CheckerLoadError[];
}

/** 插件文件：跳过 .d.ts（声明文件不是模块），只收 .ts/.js */
function isPluginFile(name: string): boolean {
  if (name.endsWith(".d.ts")) return false;
  return name.endsWith(".ts") || name.endsWith(".js");
}

function manifestProblem(v: unknown): LocalizableMessage | null {
  if (typeof v !== "object" || v === null) return loadMsg("checker.load.notPlugin");
  const c = v as { manifest?: unknown; check?: unknown };
  if (typeof c.check !== "function") return loadMsg("checker.load.missingCheck");
  const m = c.manifest as { name?: unknown; version?: unknown; irVersion?: unknown; facts?: unknown } | undefined;
  if (typeof m !== "object" || m === null) return loadMsg("checker.load.missingManifest");
  if (typeof m.name !== "string" || m.name.length === 0) return loadMsg("checker.load.badName");
  if (typeof m.version !== "string") return loadMsg("checker.load.badVersion");
  if (typeof m.irVersion !== "number" || !Number.isInteger(m.irVersion)) return loadMsg("checker.load.badIrVersion");
  if (m.irVersion < 1 || m.irVersion > IR_SCHEMA_VERSION) {
    return loadMsg("checker.load.irVersionOutOfRange", { version: m.irVersion, max: IR_SCHEMA_VERSION });
  }
  if (!Array.isArray(m.facts) || m.facts.some((f) => typeof f !== "string")) return loadMsg("checker.load.badFacts");
  return null;
}

function isCheckerPlugin(v: unknown): v is CheckerPlugin {
  return manifestProblem(v) === null;
}

export async function loadCheckersFromDir(dir: string): Promise<LoadedCheckers> {
  let files: string[];
  try {
    files = readdirSync(dir).filter(isPluginFile);
  } catch (err) {
    const error = loadMsg("checker.load.unreadableDir", { error: err instanceof Error ? err.message : String(err) });
    return { checkers: [], errors: [{ file: dir, ...error }] };
  }

  const checkers: CheckerPlugin[] = [];
  const errors: CheckerLoadError[] = [];

  for (const file of files) {
    try {
      // 例外（ts-no-dynamic-import）：插件来自运行时目录，作者期不可知，静态导入不可能
      const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as Record<string, unknown>;
      if (!("default" in mod)) {
        errors.push({ file, ...loadMsg("checker.load.missingExport") });
        continue;
      }
      const candidates: unknown[] = Array.isArray(mod["default"]) ? (mod["default"] as unknown[]) : [mod["default"]];
      for (const c of candidates) {
        const problem = manifestProblem(c);
        if (problem !== null) {
          errors.push({ file, ...problem });
          continue;
        }
        if (isCheckerPlugin(c)) checkers.push(c);
      }
    } catch (err) {
      errors.push({
        file,
        ...loadMsg("checker.load.unreadableDir", { error: err instanceof Error ? err.message : String(err) }),
      });
    }
  }

  return { checkers, errors };
}
