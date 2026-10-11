/**
 * CLI 入口：
 *   pnpm scan <工程目录> [--incremental] [--checkers <插件目录>] — 静态扫描出 HTML 报告
 *   pnpm maintain <工程目录> <语料.json>          — 语料维护报告（三分类 + 重链）
 *   pnpm content <工程目录> [基线.json] [--save]  — 新内容检测（可达事件页 diff）
 *   pnpm aigen <工程目录> "自然语言需求"           — AI 生成测试场景（需 Ollama + 聊天模型）
 *   pnpm scene:run <工程目录> <场景.json>         — 真实引擎上执行场景
 *   pnpm fuzz <工程目录> [--time ms] [--steps n] [--seed n] — 真实引擎随机探索
 *   pnpm golden <工程目录> <approve|check> <标签> [--threshold n] — 截图基线审批/回归对比
 *   pnpm corpus <工程目录> [add <场景.json> | list] — 场景库入库/列举
 *   pnpm regress <工程目录>                       — 场景库一键回归
 *   pnpm explain <工程目录> <场景.json>           — 失败轨迹解释（需 Ollama + 聊天模型）
 *   pnpm repair <工程目录> <语料.json>            — 过时场景修复提案（需 Ollama + 聊天模型）
 *   pnpm deploy <部署产物目录>                    — 部署验收（大小写/字体专项）
 *
 * 语言：--lang zh|ja|ko|en 或环境变量 RMTEST_LANG（默认跟随系统，兜底 zh）。
 * 动词可省略：package.json 的 `pnpm scan` 直接透传工程目录，
 * 入口会把非动词的 argv[2] 当作工程目录并补一个隐式 scan。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localizeMessage, resolveLocale, setLocale, t } from "@rmtest/i18n";
import { loadCheckersFromDir, type LoadedCheckers } from "@rmtest/checkers";
import { aigen, defaultProvider } from "./aigen.ts";
import { contentReport } from "./content.ts";
import { corpusAdd, corpusList } from "./corpus.ts";
import { deployReport } from "./deploy.ts";
import { explainFailure } from "./explain.ts";
import { fuzzCli } from "./fuzz.ts";
import { goldenCli } from "./golden.ts";
import { maintain } from "./maintain.ts";
import { regressCli } from "./regress.ts";
import { repairCli } from "./repair.ts";
import { runScenarioCli } from "./run.ts";
import { scan } from "./scan.ts";

/** 已知动词：argv[2] 命中才视为显式命令，否则按工程目录走隐式 scan。 */
const VERBS: Record<string, true> = {
  scan: true,
  maintain: true,
  content: true,
  aigen: true,
  run: true,
  fuzz: true,
  golden: true,
  corpus: true,
  regress: true,
  explain: true,
  repair: true,
  deploy: true,
};

/** 带值选项：归一化时必须与其取值相邻保留（--lang zh / --checkers <目录> / --steps n …） */
const VALUE_FLAGS: Record<string, true> = {
  "--lang": true,
  "--checkers": true,
  "--threshold": true,
  "--seed": true,
  "--steps": true,
  "--time": true,
};

/**
 * 归一化参数：package.json 的 `pnpm scan` 只透传工程目录（无动词），
 * 此时 argv[2] 是目录而非命令——补一个隐式 "scan"，让各分支继续按 argv[3]/argv[4] 取参。
 * 定位工程目录时跳过选项及其取值（否则 --checkers <目录> 的取值会被误当成工程目录）；
 * 其余参数保持原有相对顺序，**不能**把选项与取值拆开。
 * 无位置参数时工程目录回退为 "."（当前工作目录）。
 */
function normalizeArgv(raw: readonly string[]): string[] {
  const first = raw[2];
  if (first !== undefined && VERBS[first] === true) return [...raw];
  const rest = raw.slice(2);
  let dirIndex = -1;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith("-")) {
      if (VALUE_FLAGS[arg] === true) i++; // 跳过该选项的取值
      continue;
    }
    dirIndex = i;
    break;
  }
  const dir = dirIndex >= 0 ? rest[dirIndex]! : ".";
  return [...raw.slice(0, 2), "scan", dir, ...rest.filter((_, i) => i !== dirIndex)];
}

/** --name value / --name=value */
function optionValue(argv: readonly string[], name: string): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

/** 数值选项：缺失或非数值 → undefined */
function numberOption(argv: readonly string[], name: string): number | undefined {
  const value = optionValue(argv, name);
  return value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined;
}

const argv = normalizeArgv(process.argv);
const cmd = argv[2]!;
const locale = resolveLocale(optionValue(argv, "--lang"));
setLocale(locale);

if (cmd === "maintain") {
  const projectDir = path.resolve(argv[3] ?? ".");
  const corpusPath = path.resolve(argv[4] ?? "corpus.json");
  const apply = argv.includes("--apply");

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(corpusPath, "utf8"));
  } catch (err) {
    console.error(t(locale, "cli.error.corpusRead", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
  if (!Array.isArray(raw)) {
    console.error(t(locale, "cli.error.corpusNotArray"));
    process.exit(2);
  }

  const outcome = maintain(projectDir, raw);
  console.log(
    t(locale, "cli.maintain.summary", {
      fresh: outcome.report.fresh,
      broken: outcome.report.broken,
      stale: outcome.report.stale,
    }),
  );
  if (outcome.badEntries.length > 0) {
    console.log(t(locale, "cli.maintain.badEntries", { count: outcome.badEntries.length }));
    for (const e of outcome.badEntries) console.log(`  ${e}`);
  }
  for (const item of outcome.report.items) {
    if (item.status !== "fresh") {
      console.log(
        item.issues.length > 0
          ? t(locale, "cli.item.detail", { status: item.status, id: item.scenarioId, issues: item.issues.join("; ") })
          : t(locale, "cli.item.plain", { status: item.status, id: item.scenarioId }),
      );
    }
  }
  console.log(t(locale, "cli.maintain.relink", { relinked: outcome.relinked, unresolved: outcome.unresolved }));
  if (apply) {
    writeFileSync(corpusPath, JSON.stringify(outcome.corpus, null, 2));
    console.log(t(locale, "cli.maintain.applied", { path: corpusPath }));
  }
  process.exitCode = outcome.report.broken > 0 ? 1 : 0;
} else if (cmd === "content") {
  const projectDir = path.resolve(argv[3] ?? ".");
  const baselinePath = argv[4] ? path.resolve(argv[4]) : null;
  const save = argv.includes("--save");

  let baselineKeys: string[] | undefined;
  if (baselinePath) {
    try {
      const raw = JSON.parse(readFileSync(baselinePath, "utf8")) as { keys?: unknown };
      if (!Array.isArray(raw["keys"])) {
        console.error(t(locale, "cli.error.baselineShape"));
        process.exit(2);
      }
      baselineKeys = raw["keys"] as string[];
    } catch {
      baselineKeys = undefined; // 基线不存在 → 视为首次运行
    }
  }

  const report = contentReport(projectDir, baselineKeys);
  console.log(t(locale, "cli.content.total", { count: report.total }));
  if (report.hasBaseline) {
    console.log(t(locale, "cli.content.added", { count: report.added.length }));
    for (const k of report.added) console.log(`  + ${k}`);
    console.log(t(locale, "cli.content.removed", { count: report.removed.length }));
    for (const k of report.removed) console.log(`  - ${k}`);
  } else {
    console.log(t(locale, "cli.content.noBaseline"));
  }
  if (save || !baselinePath) {
    const out = baselinePath ?? path.join(projectDir, "rmtest-baseline.json");
    writeFileSync(out, JSON.stringify({ keys: report.keys }, null, 2));
    console.log(t(locale, "cli.content.saved", { path: out }));
  }
} else if (cmd === "aigen") {
  const projectDir = path.resolve(argv[3] ?? ".");
  const nl = argv[4] ?? "";
  if (!nl) {
    console.error(t(locale, "cli.usage.aigen"));
    process.exit(2);
  }
  try {
    const outcome = await aigen(projectDir, nl, defaultProvider());
    if (outcome.error) {
      console.error(t(locale, "cli.aigen.failed", { attempts: outcome.attempts, error: outcome.error }));
      for (const f of outcome.feedback) console.error(t(locale, "cli.feedback", { feedback: f }));
      process.exit(1);
    }
    console.log(outcome.scenarioJson);
    console.error(t(locale, "cli.aigen.gatePassed", { attempts: outcome.attempts }));
  } catch (err) {
    console.error(t(locale, "cli.error.aiCall", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
} else if (cmd === "run") {
  const projectDir = path.resolve(argv[3] ?? ".");
  const scenarioPath = argv[4] ? path.resolve(argv[4]) : "";
  if (!scenarioPath) {
    console.error(t(locale, "cli.usage.run"));
    process.exit(2);
  }
  try {
    const result = await runScenarioCli(projectDir, scenarioPath);
    for (const step of result.stepResults) {
      const fields = { mark: step.passed ? "✓" : "✗", index: step.index + 1, type: step.type };
      console.log(
        step.message
          ? t(locale, "cli.run.stepWithMessage", { ...fields, message: step.message })
          : t(locale, "cli.run.step", fields),
      );
    }
    console.log(t(locale, result.passed ? "cli.run.passed" : "cli.run.failed"));
    process.exitCode = result.passed ? 0 : 1;
  } catch (err) {
    console.error(t(locale, "cli.error.runFailed", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
} else if (cmd === "fuzz") {
  const projectDir = path.resolve(argv[3] ?? ".");
  try {
    const result = await fuzzCli(projectDir, {
      maxSteps: numberOption(argv, "--steps"),
      safetyBudgetMs: numberOption(argv, "--time"),
      seed: numberOption(argv, "--seed"),
    });
    console.log(
      t(locale, "cli.fuzz.summary", {
        steps: result.steps,
        novel: result.novelStates,
        crashes: result.crashes.length,
        seed: result.seed,
      }),
    );
    for (const c of result.crashes) console.log(t(locale, "cli.fuzz.crash", { crash: c }));
    if (result.truncated) console.log(t(locale, "cli.fuzz.truncated"));
    process.exitCode = result.crashes.length > 0 ? 1 : 0;
  } catch (err) {
    console.error(t(locale, "cli.error.fuzzFailed", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
} else if (cmd === "golden") {
  const projectDir = path.resolve(argv[3] ?? ".");
  const mode = argv[4] === "approve" ? "approve" : argv[4] === "check" ? "check" : null;
  const tag = argv[5] ?? "";
  if (!mode || !tag) {
    console.error(t(locale, "cli.usage.golden"));
    process.exit(2);
  }
  const thresholdIdx = argv.indexOf("--threshold");
  const threshold = thresholdIdx >= 0 && argv[thresholdIdx + 1] ? Number(argv[thresholdIdx + 1]) : 0.05;
  try {
    const result = await goldenCli(projectDir, tag, mode, threshold);
    if (mode === "approve") {
      console.log(t(locale, result.baselineExisted ? "cli.golden.approvedOverwrite" : "cli.golden.approved", { tag }));
    } else {
      console.log(
        t(locale, result.comparable ? "cli.golden.check" : "cli.golden.checkSizeMismatch", {
          tag,
          ratio: result.diffRatio.toFixed(4),
        }),
      );
      process.exitCode = result.comparable && result.diffRatio > threshold ? 1 : 0;
    }
  } catch (err) {
    console.error(t(locale, "cli.error.goldenFailed", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
} else if (cmd === "corpus") {
  const projectDir = path.resolve(argv[3] ?? ".");
  const action = argv[4] ?? "list";
  try {
    if (action === "add") {
      const scenarioPath = argv[5] ? path.resolve(argv[5]) : "";
      if (!scenarioPath) {
        console.error(t(locale, "cli.usage.corpusAdd"));
        process.exit(2);
      }
      const r = corpusAdd(projectDir, scenarioPath);
      console.log(t(locale, "cli.corpus.added", { id: r.id, steps: r.steps }));
    } else {
      const entries = corpusList(projectDir);
      console.log(t(locale, "cli.corpus.list", { count: entries.length }));
      for (const e of entries) {
        console.log(
          e.issues.length > 0
            ? t(locale, "cli.item.detail", { status: e.status, id: e.id, issues: e.issues.join("; ") })
            : t(locale, "cli.item.plain", { status: e.status, id: e.id }),
        );
      }
    }
  } catch (err) {
    console.error(t(locale, "cli.error.corpusFailed", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
} else if (cmd === "regress") {
  const projectDir = path.resolve(argv[3] ?? ".");
  try {
    const summary = await regressCli(projectDir);
    for (const item of summary.items) {
      const fields = { outcome: item.outcome, status: item.status, id: item.scenarioId };
      console.log(item.message ? t(locale, "cli.regress.itemWithMessage", { ...fields, message: item.message }) : t(locale, "cli.regress.item", fields));
    }
    console.log(
      t(locale, "cli.regress.summary", { passed: summary.passed, failed: summary.failed, skipped: summary.skipped }),
    );
    process.exitCode = summary.failed > 0 ? 1 : 0;
  } catch (err) {
    console.error(t(locale, "cli.error.regressFailed", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
} else if (cmd === "explain") {
  const projectDir = path.resolve(argv[3] ?? ".");
  const scenarioPath = argv[4] ? path.resolve(argv[4]) : "";
  if (!scenarioPath) {
    console.error(t(locale, "cli.usage.explain"));
    process.exit(2);
  }
  try {
    const result = await runScenarioCli(projectDir, scenarioPath);
    if (result.passed) {
      console.log(t(locale, "cli.explain.passed"));
      process.exitCode = 0;
    } else {
      const report = await explainFailure(
        { scenarioId: result.scenarioId, stepResults: result.stepResults, finalSnapshot: result.finalSnapshot },
        defaultProvider(),
      );
      console.log(report);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(t(locale, "cli.error.explainFailed", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
} else if (cmd === "repair") {
  const projectDir = path.resolve(argv[3] ?? ".");
  const corpusPath = argv[4] ? path.resolve(argv[4]) : "";
  if (!corpusPath) {
    console.error(t(locale, "cli.usage.repair"));
    process.exit(2);
  }
  try {
    const raw = JSON.parse(readFileSync(corpusPath, "utf8"));
    if (!Array.isArray(raw)) throw new Error(t(locale, "cli.error.corpusNotArray"));
    const outcome = await repairCli(projectDir, raw, defaultProvider());
    console.log(t(locale, "cli.repair.stale", { count: outcome.staleCount, proposals: outcome.proposals.length }));
    for (const p of outcome.proposals) {
      console.log(t(locale, "cli.repair.header", { id: p.scenarioId }));
      if (p.scenarioJson) {
        console.log(p.scenarioJson);
        console.log(t(locale, "cli.repair.gatePassed", { attempts: p.attempts }));
      } else {
        console.log(t(locale, "cli.repair.failed", { error: p.error ?? "" }));
        for (const f of p.feedback) console.log(t(locale, "cli.feedback", { feedback: f }));
      }
    }
  } catch (err) {
    console.error(t(locale, "cli.error.repairFailed", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
} else if (cmd === "deploy") {
  const projectDir = path.resolve(argv[3] ?? ".");
  try {
    const r = deployReport(projectDir);
    console.log(t(locale, "cli.scan.summary", r.counts));
    console.log(
      t(locale, r.caseMismatches > 0 ? "cli.deploy.caseWarning" : "cli.deploy.case", { count: r.caseMismatches }),
    );
    process.exitCode = r.counts.error > 0 ? 1 : 0;
  } catch (err) {
    console.error(t(locale, "cli.error.deployFailed", { error: err instanceof Error ? err.message : String(err) }));
    process.exit(2);
  }
} else {
  // scan：含隐式 scan（argv[2] 非动词时已归一化为工程目录）
  const projectDir = path.resolve(argv[3] ?? ".");
  const incremental = argv.includes("--incremental");
  const checkersDir = optionValue(argv, "--checkers");

  let external: LoadedCheckers | undefined;
  if (checkersDir) {
    external = await loadCheckersFromDir(path.resolve(checkersDir));
    for (const e of external.errors) {
      console.error(t(locale, "cli.scan.checkerLoadError", { file: e.file, message: localizeMessage(e, locale) }));
    }
  }

  const summary = scan(projectDir, {
    incremental,
    locale,
    checkers: external?.checkers,
    pluginErrors: external?.errors.map((e) => ({ plugin: e.file, message: localizeMessage(e, locale) })),
  });
  if (summary.unchanged) {
    console.log(t(locale, "cli.scan.unchanged"));
    process.exitCode = 0;
  } else {
    const reportPath = path.join(projectDir, "rmtest-report.html");
    writeFileSync(reportPath, summary.html);
    console.log(t(locale, "cli.scan.summary", summary.counts));
    if (summary.changedFiles !== null) {
      console.log(t(locale, "cli.scan.changed", { count: summary.changedFiles.length }));
      for (const f of summary.changedFiles) console.log(`  ${f}`);
    }
    if (summary.loadWarnings.length > 0) console.log(t(locale, "cli.scan.loadWarnings", { count: summary.loadWarnings.length }));
    if (summary.pluginErrors.length > 0) console.log(t(locale, "cli.scan.pluginErrors", { count: summary.pluginErrors.length }));
    console.log(t(locale, "cli.scan.report", { path: reportPath }));
    process.exitCode = summary.counts.error > 0 ? 1 : 0;
  }
}
