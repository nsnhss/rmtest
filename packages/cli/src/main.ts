/**
 * CLI 入口：
 *   pnpm scan <工程目录>                       — 静态扫描出 HTML 报告
 *   pnpm maintain <工程目录> <语料.json>       — 语料维护报告（三分类 + 重链）
 *   pnpm content <工程目录> [基线.json] [--save] — 新内容检测（可达事件页 diff）
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { contentReport } from "./content.ts";
import { maintain } from "./maintain.ts";
import { scan } from "./scan.ts";

const cmd = process.argv[2] ?? "scan";

if (cmd === "maintain") {
  const projectDir = path.resolve(process.argv[3] ?? ".");
  const corpusPath = path.resolve(process.argv[4] ?? "corpus.json");
  const apply = process.argv.includes("--apply");

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(corpusPath, "utf8"));
  } catch (err) {
    console.error(`语料文件读取失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
  if (!Array.isArray(raw)) {
    console.error("语料文件必须是场景数组");
    process.exit(2);
  }

  const outcome = maintain(projectDir, raw);
  console.log(`fresh ${outcome.report.fresh} · broken ${outcome.report.broken} · stale ${outcome.report.stale}`);
  if (outcome.badEntries.length > 0) {
    console.log(`非法条目 ${outcome.badEntries.length} 个:`);
    for (const e of outcome.badEntries) console.log(`  ${e}`);
  }
  for (const item of outcome.report.items) {
    if (item.status !== "fresh") {
      console.log(`  [${item.status}] ${item.scenarioId}${item.issues.length > 0 ? ` — ${item.issues.join("; ")}` : ""}`);
    }
  }
  console.log(`重链 ${outcome.relinked} · 未决 ${outcome.unresolved}`);
  if (apply) {
    writeFileSync(corpusPath, JSON.stringify(outcome.corpus, null, 2));
    console.log(`已写回重链后的语料: ${corpusPath}`);
  }
  process.exitCode = outcome.report.broken > 0 ? 1 : 0;
} else if (cmd === "content") {
  const projectDir = path.resolve(process.argv[3] ?? ".");
  const baselinePath = process.argv[4] ? path.resolve(process.argv[4]) : null;
  const save = process.argv.includes("--save");

  let baselineKeys: string[] | undefined;
  if (baselinePath) {
    try {
      const raw = JSON.parse(readFileSync(baselinePath, "utf8")) as { keys?: unknown };
      if (!Array.isArray(raw["keys"])) {
        console.error("基线文件格式应为 { \"keys\": [...] }");
        process.exit(2);
      }
      baselineKeys = raw["keys"] as string[];
    } catch {
      baselineKeys = undefined; // 基线不存在 → 视为首次运行
    }
  }

  const report = contentReport(projectDir, baselineKeys);
  console.log(`可达事件页 ${report.total} 个`);
  if (report.hasBaseline) {
    console.log(`新增内容 ${report.added.length} 个（未覆盖，进补测队列）:`);
    for (const k of report.added) console.log(`  + ${k}`);
    console.log(`删除内容 ${report.removed.length} 个:`);
    for (const k of report.removed) console.log(`  - ${k}`);
  } else {
    console.log("无基线（首次运行）");
  }
  if (save || !baselinePath) {
    const out = baselinePath ?? path.join(projectDir, "rmtest-baseline.json");
    writeFileSync(out, JSON.stringify({ keys: report.keys }, null, 2));
    console.log(`基线已写入: ${out}`);
  }
} else {
  const projectDir = path.resolve(process.argv[3] ?? ".");
  const summary = scan(projectDir);
  const reportPath = path.join(projectDir, "rmtest-report.html");
  writeFileSync(reportPath, summary.html);
  console.log(`错误 ${summary.counts.error} · 警告 ${summary.counts.warning} · 提示 ${summary.counts.info}`);
  if (summary.loadWarnings.length > 0) console.log(`加载警告 ${summary.loadWarnings.length} 条`);
  if (summary.pluginErrors.length > 0) console.log(`插件错误 ${summary.pluginErrors.length} 条`);
  console.log(`报告: ${reportPath}`);
  process.exitCode = summary.counts.error > 0 ? 1 : 0;
}
