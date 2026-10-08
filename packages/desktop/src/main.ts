/**
 * Electron 主进程 —— 薄 IPC 层：渲染进程发命令，复用 cli 包的已验证管线。
 * 无业务逻辑；全部业务在 @rmtest/cli 的 scan/maintain/content 里。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { aigen, defaultProvider, contentReport, corpusAdd, corpusList, maintain, regressCli, scan } from "@rmtest/cli";

ipcMain.handle("scan", (_e, dir: string) => {
  const summary = scan(dir);
  const reportPath = path.join(dir, "rmtest-report.html");
  writeFileSync(reportPath, summary.html);
  return {
    counts: summary.counts,
    reportUrl: pathToFileURL(reportPath).href,
    loadWarnings: summary.loadWarnings.length,
    pluginErrors: summary.pluginErrors.length,
  };
});

ipcMain.handle("maintain", (_e, dir: string, corpusPath: string, apply: boolean) => {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(corpusPath, "utf8"));
  } catch (err) {
    return { error: `语料文件读取失败: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!Array.isArray(raw)) return { error: "语料文件必须是场景数组" };
  const outcome = maintain(dir, raw);
  const details = outcome.report.items
    .filter((i) => i.status !== "fresh")
    .map((i) => `[${i.status}] ${i.scenarioId}${i.issues.length > 0 ? ` — ${i.issues.join("; ")}` : ""}`);
  if (apply) writeFileSync(corpusPath, JSON.stringify(outcome.corpus, null, 2));
  return {
    report: outcome.report,
    relinked: outcome.relinked,
    unresolved: outcome.unresolved,
    badEntries: outcome.badEntries,
    details,
    applied: apply,
  };
});

ipcMain.handle("content", (_e, dir: string, baselinePath: string | null) => {
  let baselineKeys: string[] | undefined;
  if (baselinePath) {
    try {
      const raw = JSON.parse(readFileSync(baselinePath, "utf8")) as { keys?: unknown };
      if (Array.isArray(raw["keys"])) baselineKeys = raw["keys"] as string[];
    } catch {
      baselineKeys = undefined;
    }
  }
  return contentReport(dir, baselineKeys);
});

ipcMain.handle("aigen", async (_e, dir: string, nl: string) => {
  const outcome = await aigen(dir, nl, defaultProvider());
  return {
    scenarioJson: outcome.scenarioJson,
    attempts: outcome.attempts,
    feedback: outcome.feedback,
    error: outcome.error,
  };
});

ipcMain.handle("corpus-list", (_e, dir: string) => {
  const entries = corpusList(dir);
  return { entries, count: entries.length };
});

ipcMain.handle("corpus-add", (_e, dir: string, scenarioPath: string) => {
  const r = corpusAdd(dir, scenarioPath);
  return { id: r.id, steps: r.steps };
});

ipcMain.handle("regress", async (_e, dir: string) => {
  const summary = await regressCli(dir);
  return {
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    details: summary.items.map(
      (i) => `[${i.outcome}] (${i.status}) ${i.scenarioId}${i.message ? ` — ${i.message}` : ""}`,
    ),
  };
});

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "../app/preload.cjs"),
    },
  });
  win.loadFile(path.join(__dirname, "../app/index.html"));
});

app.on("window-all-closed", () => {
  app.quit();
});
