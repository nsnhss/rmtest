/**
 * CLI 入口：
 *   pnpm scan <工程目录>                  — 静态扫描出 HTML 报告
 *   pnpm maintain <工程目录> <语料.json>  — 语料维护报告（三分类 + 重链）
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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
