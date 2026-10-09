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
  aigen: (dir: string, nl: string) => Promise<{ scenarioJson: string | null; attempts: number; feedback: string[]; error: string | null }>;
  corpusList: (dir: string) => Promise<{ entries: Array<{ id: string; status: string; issues: string[] }>; count: number }>;
  corpusAdd: (dir: string, scenarioPath: string) => Promise<{ id: string; steps: number }>;
  regress: (dir: string) => Promise<{ passed: number; failed: number; skipped: number; details: string[] }>;
  coverage: (dir: string) => Promise<{ total: number; covered: number; maps: Array<{ mapId: number; name: string; covered: boolean }> }>;
  trends: (dir: string) => Promise<{ rows: Array<{ day: string; passed: number; failed: number }> }>;
  fuzz: (dir: string, opts: { seed?: number }) => Promise<{ steps: number; novelStates: number; crashes: string[] }>;
  goldenApprove: (dir: string, tag: string) => Promise<{ ok: boolean; tag: string }>;
  goldenCheck: (dir: string, tag: string) => Promise<{ tag: string; diffRatio: number; comparable: boolean }>;
  recordStart: (dir: string) => Promise<{ ok?: boolean; error?: string }>;
  recordStop: () => Promise<{ ok?: boolean; error?: string; path?: string; steps?: number }>;
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

byId("aiBtn").addEventListener("click", () => {
  const dir = (byId("aiDir") as HTMLInputElement).value.trim();
  const nl = (byId("aiPrompt") as HTMLInputElement).value.trim();
  const out = byId("aiResult") as HTMLPreElement;
  if (!dir || !nl) {
    out.textContent = "请输入工程目录与测试需求";
    return;
  }
  out.textContent = "生成中（本地推理，耐心）…";
  void api.aigen(dir, nl).then((r) => {
    if (r.error) {
      out.textContent = `生成失败（${r.attempts} 次）: ${r.error}\n` + r.feedback.map((f) => `  反馈: ${f}`).join("\n");
      return;
    }
    out.textContent = r.scenarioJson + `\n（${r.attempts} 次尝试过校验闸门）`;
  }).catch((err: Error) => {
    out.textContent = `生成失败: ${err.message}`;
  });
});

byId("corpusAddBtn").addEventListener("click", () => {
  const dir = (byId("corpusDir") as HTMLInputElement).value.trim();
  const scenarioPath = (byId("corpusAddPath") as HTMLInputElement).value.trim();
  const out = byId("corpusResult") as HTMLPreElement;
  if (!dir || !scenarioPath) {
    out.textContent = "请输入工程目录与场景 JSON 路径";
    return;
  }
  void api.corpusAdd(dir, scenarioPath).then((r) => {
    out.textContent = `已入库: ${r.id}（${r.steps} 步）`;
  }).catch((err: Error) => {
    out.textContent = `入库失败: ${err.message}`;
  });
});

byId("corpusListBtn").addEventListener("click", () => {
  const dir = (byId("corpusDir") as HTMLInputElement).value.trim();
  const out = byId("corpusResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = "请输入工程目录";
    return;
  }
  void api.corpusList(dir).then((r) => {
    out.textContent = [`语料 ${r.count} 个场景:`, ...r.entries.map((e) => `  [${e.status}] ${e.id}${e.issues.length > 0 ? ` — ${e.issues.join("; ")}` : ""}`)].join("\n");
  }).catch((err: Error) => {
    out.textContent = `列出失败: ${err.message}`;
  });
});

byId("regressBtn").addEventListener("click", () => {
  const dir = (byId("regressDir") as HTMLInputElement).value.trim();
  const out = byId("regressResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = "请输入工程目录";
    return;
  }
  out.textContent = "回归中（启动真实引擎，耐心）…";
  void api.regress(dir).then((r) => {
    out.textContent = [...r.details, `通过 ${r.passed} · 失败 ${r.failed} · 跳过 ${r.skipped}`].join("\n");
  }).catch((err: Error) => {
    out.textContent = `回归失败: ${err.message}`;
  });
});

byId("coverageBtn").addEventListener("click", () => {
  const dir = (byId("vizDir") as HTMLInputElement).value.trim();
  const out = byId("vizResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = "请输入工程目录";
    return;
  }
  void api.coverage(dir).then((r) => {
    const lines = [`场景覆盖: ${r.covered}/${r.total} 个可达地图`, ...r.maps.map((m) => `  ${m.covered ? "✓" : "✗"} 地图 ${m.mapId} (${m.name})`)];
    out.textContent = lines.join("\n");
  }).catch((err: Error) => {
    out.textContent = `覆盖计算失败: ${err.message}`;
  });
});

byId("trendsBtn").addEventListener("click", () => {
  const dir = (byId("vizDir") as HTMLInputElement).value.trim();
  const out = byId("vizResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = "请输入工程目录";
    return;
  }
  void api.trends(dir).then((r) => {
    if (r.rows.length === 0) {
      out.textContent = "近 14 天无回归记录";
      return;
    }
    const lines = r.rows.map((row) => {
      const bar = "▓".repeat(Math.min(row.passed + row.failed, 40));
      return `  ${row.day}  通过 ${row.passed} · 失败 ${row.failed}  ${bar}`;
    });
    out.textContent = ["回归趋势（近 14 天）:", ...lines].join("\n");
  }).catch((err: Error) => {
    out.textContent = `趋势查询失败: ${err.message}`;
  });
});

byId("fuzzBtn").addEventListener("click", () => {
  const dir = (byId("dynDir") as HTMLInputElement).value.trim();
  const seedRaw = (byId("dynArg") as HTMLInputElement).value.trim();
  const out = byId("dynResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = "请输入工程目录";
    return;
  }
  out.textContent = "fuzz 中（真实引擎，耐心）…";
  void api.fuzz(dir, { seed: seedRaw ? Number(seedRaw) : undefined }).then((r) => {
    out.textContent = [`步数 ${r.steps} · 新颖状态 ${r.novelStates} · 崩溃 ${r.crashes.length}`, ...r.crashes.map((c) => `  崩溃: ${c}`)].join("\n");
  }).catch((err: Error) => {
    out.textContent = `fuzz 失败: ${err.message}`;
  });
});

byId("goldenApproveBtn").addEventListener("click", () => {
  const dir = (byId("dynDir") as HTMLInputElement).value.trim();
  const tag = (byId("dynArg") as HTMLInputElement).value.trim() || "default";
  const out = byId("dynResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = "请输入工程目录";
    return;
  }
  out.textContent = "截图中…";
  void api.goldenApprove(dir, tag).then(() => {
    out.textContent = `基线 ${tag} 已批准`;
  }).catch((err: Error) => {
    out.textContent = `golden 失败: ${err.message}`;
  });
});

byId("goldenCheckBtn").addEventListener("click", () => {
  const dir = (byId("dynDir") as HTMLInputElement).value.trim();
  const tag = (byId("dynArg") as HTMLInputElement).value.trim() || "default";
  const out = byId("dynResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = "请输入工程目录";
    return;
  }
  out.textContent = "对比中…";
  void api.goldenCheck(dir, tag).then((r) => {
    out.textContent = `基线 ${r.tag} diffRatio=${r.diffRatio.toFixed(4)}${r.comparable ? "" : "（尺寸不匹配）"}`;
  }).catch((err: Error) => {
    out.textContent = `golden 失败: ${err.message}`;
  });
});

byId("recordStartBtn").addEventListener("click", () => {
  const dir = (byId("dynDir") as HTMLInputElement).value.trim();
  const out = byId("dynResult") as HTMLPreElement;
  if (!dir) {
    out.textContent = "请输入工程目录";
    return;
  }
  void api.recordStart(dir).then((r) => {
    out.textContent = r.error ?? "录制中：在游戏窗口里游玩，完成后点\"停止并保存\"（或按 Esc）";
  }).catch((err: Error) => {
    out.textContent = `录制启动失败: ${err.message}`;
  });
});

byId("recordStopBtn").addEventListener("click", () => {
  const out = byId("dynResult") as HTMLPreElement;
  void api.recordStop().then((r) => {
    out.textContent = r.error ?? `已保存: ${r.path}（${r.steps} 步）`;
  }).catch((err: Error) => {
    out.textContent = `录制停止失败: ${err.message}`;
  });
});
