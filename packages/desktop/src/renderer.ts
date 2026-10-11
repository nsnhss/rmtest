/**
 * 渲染进程 UI 逻辑 —— 只做两件事：读输入 → 调 window.api → 渲染结果。
 * 界面语言可切换（zh/ja/ko/en）：静态外壳走 data-i18n，结果串走目录查表。
 */
import { LOCALES, LOCALE_LABELS, resolveLocale, setLocale, t, type Locale } from "@rmtest/i18n";

interface ScanResult {
  counts: { error: number; warning: number; info: number };
  reportUrl: string;
  loadWarnings: number;
  pluginErrors: number;
}

interface MaintainResult {
  error?: string;
  report?: { fresh: number; broken: number; stale: number };
  relinked?: number;
  unresolved?: number;
  badEntries?: string[];
  details?: string[];
  applied?: boolean;
}

interface ContentResult {
  total: number;
  hasBaseline: boolean;
  added: string[];
  removed: string[];
}

interface Api {
  scan: (dir: string, locale: Locale) => Promise<ScanResult>;
  maintain: (dir: string, corpusPath: string, apply: boolean, locale: Locale) => Promise<MaintainResult>;
  content: (dir: string, baselinePath: string | null, locale: Locale) => Promise<ContentResult>;
  aigen: (dir: string, nl: string, locale: Locale) => Promise<{ scenarioJson: string | null; attempts: number; feedback: string[]; error: string | null }>;
  corpusList: (dir: string, locale: Locale) => Promise<{ entries: Array<{ id: string; status: string; issues: string[] }>; count: number }>;
  corpusAdd: (dir: string, scenarioPath: string, locale: Locale) => Promise<{ id: string; steps: number }>;
  regress: (dir: string, locale: Locale) => Promise<{ passed: number; failed: number; skipped: number; details: string[] }>;
  coverage: (dir: string, locale: Locale) => Promise<{ total: number; covered: number; maps: Array<{ mapId: number; name: string; covered: boolean }> }>;
  trends: (dir: string, locale: Locale) => Promise<{ rows: Array<{ day: string; passed: number; failed: number }> }>;
  fuzz: (dir: string, opts: { seed?: number }, locale: Locale) => Promise<{ steps: number; novelStates: number; crashes: string[] }>;
  goldenApprove: (dir: string, tag: string, locale: Locale) => Promise<{ ok: boolean; tag: string }>;
  goldenCheck: (dir: string, tag: string, locale: Locale) => Promise<{ tag: string; diffRatio: number; comparable: boolean }>;
  recordStart: (dir: string, locale: Locale) => Promise<{ ok?: boolean; error?: string }>;
  recordStop: (locale: Locale) => Promise<{ ok?: boolean; error?: string; path?: string; steps?: number }>;
}

declare global {
  interface Window {
    api: Api;
  }
}

function byId(id: string): HTMLInputElement | HTMLButtonElement | HTMLElement {
  return document.getElementById(id)!;
}

const api = window.api;

// —— 语言：初始解析 → 静态外壳翻译 → 选择器切换 ——
const LANG_STORAGE_KEY = "rmtestLang";

const langSelect = byId("langSelect") as HTMLSelectElement;
let storedLang: string | null = null;
try {
  storedLang = localStorage.getItem(LANG_STORAGE_KEY);
} catch {
  // 无存储权限（沙箱异常）时退回系统语言
}
let locale: Locale = storedLang ? resolveLocale(storedLang) : resolveLocale();

/** 用 LOCALE_LABELS 重建选项：自称不随当前语言变化 */
function renderLangOptions(): void {
  langSelect.replaceChildren();
  for (const key of LOCALES) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = LOCALE_LABELS[key];
    langSelect.appendChild(option);
  }
}

/** 应用一个语言：同步进程态、翻译 data-i18n 外壳、更新 <html lang> */
function applyLocale(target: Locale): void {
  locale = target;
  setLocale(target);
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(target, el.dataset["i18n"]!);
  }
  for (const el of document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) {
    el.placeholder = t(target, el.dataset["i18nPlaceholder"]!);
  }
  langSelect.value = target;
  document.documentElement.lang = target;
}

renderLangOptions();
applyLocale(locale);

langSelect.addEventListener("change", () => {
  const next = resolveLocale(langSelect.value);
  try {
    localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    // 存不下也无妨，仅本次生效
  }
  applyLocale(next);
});

byId("scanBtn").addEventListener("click", () => {
  const dir = (byId("scanDir") as HTMLInputElement).value.trim();
  const result = byId("scanResult");
  const frame = byId("reportFrame") as HTMLIFrameElement;
  if (!dir) {
    result.textContent = t(locale, "ui.error.needDir");
    return;
  }
  result.textContent = t(locale, "ui.scan.running");
  void api.scan(dir, locale).then((r) => {
    result.textContent = t(locale, "ui.scan.summary", { error: r.counts.error, warning: r.counts.warning, info: r.counts.info }) +
      (r.loadWarnings > 0 ? t(locale, "ui.scan.loadWarnings", { count: r.loadWarnings }) : "") +
      (r.pluginErrors > 0 ? t(locale, "ui.scan.pluginErrors", { count: r.pluginErrors }) : "");
    frame.src = r.reportUrl;
    frame.hidden = false;
  }).catch((err: Error) => {
    result.textContent = t(locale, "ui.scan.failed", { error: err.message });
  });
});

byId("maintainBtn").addEventListener("click", () => {
  const dir = (byId("maintainDir") as HTMLInputElement).value.trim();
  const corpus = (byId("corpusPath") as HTMLInputElement).value.trim();
  const apply = (byId("apply") as HTMLInputElement).checked;
  const out = byId("maintainResult") as HTMLPreElement;
  if (!dir || !corpus) {
    out.textContent = t(locale, "ui.error.needDirAndCorpus");
    return;
  }
  out.textContent = t(locale, "ui.maintain.running");
  void api.maintain(dir, corpus, apply, locale).then((r) => {
    if (r.error) {
      out.textContent = r.error;
      return;
    }
    const lines = [
      t(locale, "ui.maintain.summary", { fresh: r.report!.fresh, broken: r.report!.broken, stale: r.report!.stale }),
      ...(r.badEntries ?? []).map((e) => t(locale, "ui.maintain.badEntry", { entry: e })),
      ...(r.details ?? []),
      t(locale, "ui.maintain.relink", { relinked: r.relinked!, unresolved: r.unresolved! }) + (r.applied ? t(locale, "ui.maintain.applied") : ""),
    ];
    out.textContent = lines.join("\n");
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.maintain.failed", { error: err.message });
  });
});

byId("contentBtn").addEventListener("click", () => {
  const dir = (byId("contentDir") as HTMLInputElement).value.trim();
  const baseline = (byId("baselinePath") as HTMLInputElement).value.trim() || null;
  const out = byId("contentResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = t(locale, "ui.error.needDir");
    return;
  }
  out.textContent = t(locale, "ui.content.running");
  void api.content(dir, baseline, locale).then((r) => {
    const lines = [t(locale, "ui.content.total", { count: r.total })];
    if (r.hasBaseline) {
      lines.push(t(locale, "ui.content.added", { count: r.added.length }), ...r.added.map((k) => `  + ${k}`));
      lines.push(t(locale, "ui.content.removed", { count: r.removed.length }), ...r.removed.map((k) => `  - ${k}`));
    } else {
      lines.push(t(locale, "ui.content.noBaseline"));
    }
    out.textContent = lines.join("\n");
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.content.failed", { error: err.message });
  });
});

byId("aiBtn").addEventListener("click", () => {
  const dir = (byId("aiDir") as HTMLInputElement).value.trim();
  const nl = (byId("aiPrompt") as HTMLInputElement).value.trim();
  const out = byId("aiResult") as HTMLPreElement;
  if (!dir || !nl) {
    out.textContent = t(locale, "ui.error.needDirAndPrompt");
    return;
  }
  out.textContent = t(locale, "ui.aigen.running");
  void api.aigen(dir, nl, locale).then((r) => {
    if (r.error) {
      out.textContent = t(locale, "ui.aigen.failed", { attempts: r.attempts, error: r.error }) + "\n" +
        r.feedback.map((f) => t(locale, "ui.aigen.feedback", { feedback: f })).join("\n");
      return;
    }
    out.textContent = r.scenarioJson + t(locale, "ui.aigen.gatePassed", { attempts: r.attempts });
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.aigen.failedPlain", { error: err.message });
  });
});

byId("corpusAddBtn").addEventListener("click", () => {
  const dir = (byId("corpusDir") as HTMLInputElement).value.trim();
  const scenarioPath = (byId("corpusAddPath") as HTMLInputElement).value.trim();
  const out = byId("corpusResult") as HTMLPreElement;
  if (!dir || !scenarioPath) {
    out.textContent = t(locale, "ui.error.needDirAndScenario");
    return;
  }
  void api.corpusAdd(dir, scenarioPath, locale).then((r) => {
    out.textContent = t(locale, "ui.corpus.added", { id: r.id, steps: r.steps });
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.corpus.addFailed", { error: err.message });
  });
});

byId("corpusListBtn").addEventListener("click", () => {
  const dir = (byId("corpusDir") as HTMLInputElement).value.trim();
  const out = byId("corpusResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = t(locale, "ui.error.needDir");
    return;
  }
  void api.corpusList(dir, locale).then((r) => {
    out.textContent = [
      t(locale, "ui.corpus.list", { count: r.count }),
      ...r.entries.map((e) =>
        t(locale, "ui.corpus.listItem", { status: e.status, id: e.id }) +
        (e.issues.length > 0 ? t(locale, "ui.corpus.issueSuffix", { issues: e.issues.join("; ") }) : ""),
      ),
    ].join("\n");
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.corpus.listFailed", { error: err.message });
  });
});

byId("regressBtn").addEventListener("click", () => {
  const dir = (byId("regressDir") as HTMLInputElement).value.trim();
  const out = byId("regressResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = t(locale, "ui.error.needDir");
    return;
  }
  out.textContent = t(locale, "ui.regress.running");
  void api.regress(dir, locale).then((r) => {
    out.textContent = [...r.details, t(locale, "ui.regress.summary", { passed: r.passed, failed: r.failed, skipped: r.skipped })].join("\n");
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.regress.failed", { error: err.message });
  });
});

byId("coverageBtn").addEventListener("click", () => {
  const dir = (byId("vizDir") as HTMLInputElement).value.trim();
  const out = byId("vizResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = t(locale, "ui.error.needDir");
    return;
  }
  void api.coverage(dir, locale).then((r) => {
    const lines = [
      t(locale, "ui.coverage.summary", { covered: r.covered, total: r.total }),
      ...r.maps.map((m) => t(locale, "ui.coverage.mapLine", { mark: m.covered ? "✓" : "✗", mapId: m.mapId, name: m.name })),
    ];
    out.textContent = lines.join("\n");
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.coverage.failed", { error: err.message });
  });
});

byId("trendsBtn").addEventListener("click", () => {
  const dir = (byId("vizDir") as HTMLInputElement).value.trim();
  const out = byId("vizResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = t(locale, "ui.error.needDir");
    return;
  }
  void api.trends(dir, locale).then((r) => {
    if (r.rows.length === 0) {
      out.textContent = t(locale, "ui.trends.empty");
      return;
    }
    const lines = r.rows.map((row) => {
      const bar = "▓".repeat(Math.min(row.passed + row.failed, 40));
      return t(locale, "ui.trends.row", { day: row.day, passed: row.passed, failed: row.failed, bar });
    });
    out.textContent = [t(locale, "ui.trends.title"), ...lines].join("\n");
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.trends.failed", { error: err.message });
  });
});

byId("fuzzBtn").addEventListener("click", () => {
  const dir = (byId("dynDir") as HTMLInputElement).value.trim();
  const seedRaw = (byId("dynArg") as HTMLInputElement).value.trim();
  const out = byId("dynResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = t(locale, "ui.error.needDir");
    return;
  }
  out.textContent = t(locale, "ui.fuzz.running");
  void api.fuzz(dir, { seed: seedRaw ? Number(seedRaw) : undefined }, locale).then((r) => {
    out.textContent = [
      t(locale, "ui.fuzz.summary", { steps: r.steps, novelStates: r.novelStates, crashes: r.crashes.length }),
      ...r.crashes.map((c) => t(locale, "ui.fuzz.crash", { crash: c })),
    ].join("\n");
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.fuzz.failed", { error: err.message });
  });
});

byId("goldenApproveBtn").addEventListener("click", () => {
  const dir = (byId("dynDir") as HTMLInputElement).value.trim();
  const tag = (byId("dynArg") as HTMLInputElement).value.trim() || "default";
  const out = byId("dynResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = t(locale, "ui.error.needDir");
    return;
  }
  out.textContent = t(locale, "ui.golden.approving");
  void api.goldenApprove(dir, tag, locale).then(() => {
    out.textContent = t(locale, "ui.golden.approved", { tag });
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.golden.failed", { error: err.message });
  });
});

byId("goldenCheckBtn").addEventListener("click", () => {
  const dir = (byId("dynDir") as HTMLInputElement).value.trim();
  const tag = (byId("dynArg") as HTMLInputElement).value.trim() || "default";
  const out = byId("dynResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = t(locale, "ui.error.needDir");
    return;
  }
  out.textContent = t(locale, "ui.golden.checking");
  void api.goldenCheck(dir, tag, locale).then((r) => {
    out.textContent = t(locale, "ui.golden.check", { tag: r.tag, ratio: r.diffRatio.toFixed(4) }) +
      (r.comparable ? "" : t(locale, "ui.golden.sizeMismatch"));
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.golden.failed", { error: err.message });
  });
});

byId("recordStartBtn").addEventListener("click", () => {
  const dir = (byId("dynDir") as HTMLInputElement).value.trim();
  const out = byId("dynResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = t(locale, "ui.error.needDir");
    return;
  }
  void api.recordStart(dir, locale).then((r) => {
    out.textContent = r.error ?? t(locale, "ui.record.running");
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.record.startFailed", { error: err.message });
  });
});

byId("recordStopBtn").addEventListener("click", () => {
  const out = byId("dynResult") as HTMLPreElement;
  void api.recordStop(locale).then((r) => {
    out.textContent = r.error ?? t(locale, "ui.record.saved", { path: r.path!, steps: r.steps! });
  }).catch((err: Error) => {
    out.textContent = t(locale, "ui.record.stopFailed", { error: err.message });
  });
});
