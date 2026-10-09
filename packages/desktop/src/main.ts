/**
 * Electron 主进程 —— 薄 IPC 层：渲染进程发命令，复用 cli 包的已验证管线。
 * 无业务逻辑；全部业务在 @rmtest/cli 的 scan/maintain/content 里。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { aigen, contentReport, corpusAdd, corpusList, defaultProvider, fuzzCli, goldenCli, loadProjectAny, maintain, regressCli, scan } from "@rmtest/cli";
import { scenarioMapCoverage } from "@rmtest/core";
import { ScenarioSchema } from "@rmtest/dsl";
import { REAL_BRIDGE, gotoMap, startRecording, type GameHandle, type RecordingHandle } from "@rmtest/runtime";
import { ProjectStore } from "@rmtest/store";

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

ipcMain.handle("coverage", (_e, dir: string) => {
  const { project } = loadProjectAny(dir);
  const store = new ProjectStore(path.join(dir, "rmtest.db"));
  const scenarios = store.listScenarios().map((s) => ScenarioSchema.parse(JSON.parse(s.json)));
  store.close();
  return scenarioMapCoverage(project.ir, scenarios);
});

ipcMain.handle("trends", (_e, dir: string) => {
  const store = new ProjectStore(path.join(dir, "rmtest.db"));
  const rows = store.trendSummary(14);
  store.close();
  return { rows };
});

ipcMain.handle("fuzz", async (_e, dir: string, opts: { maxSteps?: number; timeBudgetMs?: number; seed?: number }) => {
  const result = await fuzzCli(dir, opts);
  return { steps: result.steps, novelStates: result.novelStates, crashes: result.crashes };
});

ipcMain.handle("golden-approve", async (_e, dir: string, tag: string) => {
  await goldenCli(dir, tag, "approve");
  return { ok: true, tag };
});

ipcMain.handle("golden-check", async (_e, dir: string, tag: string) => {
  const r = await goldenCli(dir, tag, "check");
  return { tag: r.tag, diffRatio: r.diffRatio, comparable: r.comparable };
});

// —— 录制：可见游戏窗口，用户真实游玩，键盘捕获 → DSL 场景 ——
let activeRecording: { handle: RecordingHandle; dir: string; win: BrowserWindow } | null = null;

ipcMain.handle("record-start", async (_e, dir: string) => {
  if (activeRecording) return { error: "已有录制会话在运行" };
  const url = pathToFileURL(path.join(dir, "index.html")).href;
  const win = new BrowserWindow({
    width: 816,
    height: 624,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  // 捕获游戏页面错误栈（SceneManager 吞掉了栈，这里提前记录）
  win.webContents.on("did-finish-load", () => {
    void win.webContents.executeJavaScript(
      `window.addEventListener('error', (e) => { window.__rmtestErrorStack = (e.error && e.error.stack) || String(e.message); });`,
    );
  });
  await win.loadURL(url);
  await win.webContents.executeJavaScript(REAL_BRIDGE);

  const adapter: GameHandle = {
    evaluate: (fn, ...args) => {
      // 字符串 = 完整代码（如 IIFE 桥脚本），直接执行；函数才 stringify + 传参
      const code =
        typeof fn === "function"
          ? `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`
          : String(fn);
      return win.webContents.executeJavaScript(code) as Promise<unknown>;
    },
  };

  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    ready = (await adapter.evaluate(
      () => (window as never as { __rmtestReal?: { ready: () => boolean } }).__rmtestReal!.ready(),
    )) as boolean;
    if (ready) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) {
    win.close();
    return { error: "游戏引擎启动超时" };
  }
  const entered = await gotoMap(adapter);
  if (!entered) {
    win.close();
    return { error: "进入地图场景失败" };
  }

  const handle = await startRecording(adapter, { scenarioId: `rec-${Date.now()}` });
  activeRecording = { handle, dir, win };
  return { ok: true };
});

ipcMain.handle("record-stop", async () => {
  if (!activeRecording) return { error: "无录制会话" };
  const { handle, dir, win } = activeRecording;
  activeRecording = null;
  const scenario = await handle.stop();
  const outPath = path.join(dir, "recorded-scenario.json");
  writeFileSync(outPath, JSON.stringify(scenario, null, 2));
  win.close();
  return { ok: true, path: outPath, steps: scenario.steps.length };
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
