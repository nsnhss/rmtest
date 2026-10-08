/**
 * 渲染进程 UI 逻辑 —— 只做两件事：读输入 → 调 window.api → 渲染结果。
 */
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
  scan: (dir: string) => Promise<ScanResult>;
  maintain: (dir: string, corpusPath: string, apply: boolean) => Promise<MaintainResult>;
  content: (dir: string, baselinePath: string | null) => Promise<ContentResult>;
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

byId("scanBtn").addEventListener("click", () => {
  const dir = (byId("scanDir") as HTMLInputElement).value.trim();
  const result = byId("scanResult");
  const frame = byId("reportFrame") as HTMLIFrameElement;
  if (!dir) {
    result.textContent = "请输入工程目录";
    return;
  }
  result.textContent = "扫描中…";
  void api.scan(dir).then((r) => {
    result.textContent = `错误 ${r.counts.error} · 警告 ${r.counts.warning} · 提示 ${r.counts.info}` +
      (r.loadWarnings > 0 ? ` · 加载警告 ${r.loadWarnings}` : "") +
      (r.pluginErrors > 0 ? ` · 插件错误 ${r.pluginErrors}` : "");
    frame.src = r.reportUrl;
    frame.hidden = false;
  }).catch((err: Error) => {
    result.textContent = `扫描失败: ${err.message}`;
  });
});

byId("maintainBtn").addEventListener("click", () => {
  const dir = (byId("maintainDir") as HTMLInputElement).value.trim();
  const corpus = (byId("corpusPath") as HTMLInputElement).value.trim();
  const apply = (byId("apply") as HTMLInputElement).checked;
  const out = byId("maintainResult") as HTMLPreElement;
  if (!dir || !corpus) {
    out.textContent = "请输入工程目录与语料路径";
    return;
  }
  out.textContent = "维护中…";
  void api.maintain(dir, corpus, apply).then((r) => {
    if (r.error) {
      out.textContent = r.error;
      return;
    }
    const lines = [
      `fresh ${r.report!.fresh} · broken ${r.report!.broken} · stale ${r.report!.stale}`,
      ...(r.badEntries ?? []).map((e) => `非法条目: ${e}`),
      ...(r.details ?? []),
      `重链 ${r.relinked} · 未决 ${r.unresolved}${r.applied ? " · 已写回语料" : ""}`,
    ];
    out.textContent = lines.join("\n");
  }).catch((err: Error) => {
    out.textContent = `维护失败: ${err.message}`;
  });
});

byId("contentBtn").addEventListener("click", () => {
  const dir = (byId("contentDir") as HTMLInputElement).value.trim();
  const baseline = (byId("baselinePath") as HTMLInputElement).value.trim() || null;
  const out = byId("contentResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = "请输入工程目录";
    return;
  }
  out.textContent = "检测中…";
  void api.content(dir, baseline).then((r) => {
    const lines = [`可达事件页 ${r.total} 个`];
    if (r.hasBaseline) {
      lines.push(`新增 ${r.added.length} 个（未覆盖，进补测队列）:`, ...r.added.map((k) => `  + ${k}`));
      lines.push(`删除 ${r.removed.length} 个:`, ...r.removed.map((k) => `  - ${k}`));
    } else {
      lines.push("无基线（首次运行）");
    }
    out.textContent = lines.join("\n");
  }).catch((err: Error) => {
    out.textContent = `检测失败: ${err.message}`;
  });
});
