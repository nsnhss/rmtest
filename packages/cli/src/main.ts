/**
 * CLI 入口：rmtest scan <工程目录>
 * 用法: pnpm scan <dir>  （或 tsx packages/cli/src/main.ts <dir>）
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { scan } from "./scan.ts";

const projectDir = path.resolve(process.argv[2] ?? ".");
const summary = scan(projectDir);

const reportPath = path.join(projectDir, "rmtest-report.html");
writeFileSync(reportPath, summary.html);

console.log(`错误 ${summary.counts.error} · 警告 ${summary.counts.warning} · 提示 ${summary.counts.info}`);
if (summary.loadWarnings.length > 0) console.log(`加载警告 ${summary.loadWarnings.length} 条`);
if (summary.pluginErrors.length > 0) console.log(`插件错误 ${summary.pluginErrors.length} 条`);
console.log(`报告: ${reportPath}`);

process.exitCode = summary.counts.error > 0 ? 1 : 0;
