/**
 * CLI 入口：
 *   pnpm scan <工程目录>                          — 静态扫描出 HTML 报告
 *   pnpm maintain <工程目录> <语料.json>          — 语料维护报告（三分类 + 重链）
 *   pnpm content <工程目录> [基线.json] [--save]  — 新内容检测（可达事件页 diff）
 *   pnpm aigen <工程目录> "自然语言需求"           — AI 生成测试场景（需 Ollama + 聊天模型）
 *   pnpm run <工程目录> <场景.json>               — 真实引擎上执行场景
 *   pnpm fuzz <工程目录> [--time ms] [--steps n] [--seed n] — 真实引擎随机探索
 *   pnpm golden <工程目录> <approve|check> <标签> — 截图基线审批/回归对比
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { aigen, defaultProvider } from "./aigen.ts";
import { contentReport } from "./content.ts";
import { fuzzCli } from "./fuzz.ts";
import { goldenCli } from "./golden.ts";
import { maintain } from "./maintain.ts";
import { runScenarioCli } from "./run.ts";
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
} else if (cmd === "aigen") {
  const projectDir = path.resolve(process.argv[3] ?? ".");
  const nl = process.argv[4] ?? "";
  if (!nl) {
    console.error("用法: pnpm aigen <工程目录> \"自然语言测试需求\"");
    process.exit(2);
  }
  try {
    const outcome = await aigen(projectDir, nl, defaultProvider());
    if (outcome.error) {
      console.error(`生成失败（${outcome.attempts} 次尝试）: ${outcome.error}`);
      for (const f of outcome.feedback) console.error(`  反馈: ${f}`);
      process.exit(1);
    }
    console.log(outcome.scenarioJson);
    console.error(`（${outcome.attempts} 次尝试通过校验闸门）`);
  } catch (err) {
    console.error(`AI 调用失败（Ollama 未运行或无聊天模型？）: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
} else if (cmd === "run") {
  const projectDir = path.resolve(process.argv[3] ?? ".");
  const scenarioPath = process.argv[4] ? path.resolve(process.argv[4]) : "";
  if (!scenarioPath) {
    console.error("用法: pnpm run <工程目录> <场景.json>");
    process.exit(2);
  }
  try {
    const result = await runScenarioCli(projectDir, scenarioPath);
    for (const step of result.stepResults) {
      console.log(`  [${step.passed ? "✓" : "✗"}] 第 ${step.index + 1} 步 ${step.type}${step.message ? ` — ${step.message}` : ""}`);
    }
    console.log(result.passed ? "场景通过" : "场景失败");
    process.exitCode = result.passed ? 0 : 1;
  } catch (err) {
    console.error(`执行失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
} else if (cmd === "fuzz") {
  const projectDir = path.resolve(process.argv[3] ?? ".");
  const argValue = (name: string): number | undefined => {
    const idx = process.argv.indexOf(name);
    return idx >= 0 && process.argv[idx + 1] ? Number(process.argv[idx + 1]) : undefined;
  };
  try {
    const result = await fuzzCli(projectDir, {
      maxSteps: argValue("--steps"),
      timeBudgetMs: argValue("--time"),
      seed: argValue("--seed"),
    });
    console.log(`步数 ${result.steps} · 新颖状态 ${result.novelStates} · 崩溃 ${result.crashes.length}`);
    for (const c of result.crashes) console.log(`  崩溃: ${c}`);
    process.exitCode = result.crashes.length > 0 ? 1 : 0;
  } catch (err) {
    console.error(`fuzz 失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
} else if (cmd === "golden") {
  const projectDir = path.resolve(process.argv[3] ?? ".");
  const mode = process.argv[4] === "approve" ? "approve" : process.argv[4] === "check" ? "check" : null;
  const tag = process.argv[5] ?? "";
  if (!mode || !tag) {
    console.error("用法: pnpm golden <工程目录> <approve|check> <标签> [--threshold 0.05]");
    process.exit(2);
  }
  const thresholdIdx = process.argv.indexOf("--threshold");
  const threshold = thresholdIdx >= 0 && process.argv[thresholdIdx + 1] ? Number(process.argv[thresholdIdx + 1]) : 0.05;
  try {
    const result = await goldenCli(projectDir, tag, mode, threshold);
    if (mode === "approve") {
      console.log(`基线 ${tag} 已批准${result.baselineExisted ? "（覆盖旧基线）" : ""}`);
    } else {
      console.log(`基线 ${tag} diffRatio=${result.diffRatio.toFixed(4)} ${result.comparable ? "" : "（尺寸不匹配）"}`);
      process.exitCode = result.comparable && result.diffRatio > threshold ? 1 : 0;
    }
  } catch (err) {
    console.error(`golden 失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
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
