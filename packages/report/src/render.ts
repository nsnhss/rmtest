/**
 * HTML 报告渲染 —— 类型化 section 的展示层。
 * 未知 section 类型优雅降级为通用行，不崩。
 */
import { formatLocation, type IRDocument, type ReportSection } from "@rmtest/core";

export interface RenderInput {
  ir: IRDocument;
  sections: ReportSection[];
  fingerprint: string;
  loadWarnings: string[];
  pluginErrors: { plugin: string; message: string }[];
  generatedAt?: Date;
}

const SEVERITY_ORDER: Record<ReportSection["severity"], number> = { error: 0, warning: 1, info: 2 };

const SEVERITY_LABEL: Record<ReportSection["severity"], string> = { error: "错误", warning: "警告", info: "提示" };

const CONFIDENCE_LABEL: Record<ReportSection["confidence"], string> = { high: "高", medium: "中", low: "低" };

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderReport(input: RenderInput): string {
  const { ir, sections, fingerprint, loadWarnings, pluginErrors, generatedAt = new Date() } = input;
  const sorted = [...sections].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.type.localeCompare(b.type),
  );
  const counts = { error: 0, warning: 0, info: 0 };
  for (const s of sorted) counts[s.severity]++;

  const rows = sorted
    .map(
      (s) => `<tr class="sev-${s.severity}">
<td class="sev">${SEVERITY_LABEL[s.severity]}</td>
<td class="type">${escapeHtml(s.type)}</td>
<td class="conf">${CONFIDENCE_LABEL[s.confidence]}</td>
<td class="loc">${escapeHtml(formatLocation(s.location))}</td>
<td class="msg">${escapeHtml(s.message)}</td>
<td class="ev">${s.evidence ? `<pre>${escapeHtml(JSON.stringify(s.evidence, null, 2))}</pre>` : ""}</td>
</tr>`,
    )
    .join("\n");

  const pluginErrorRows = pluginErrors
    .map((e) => `<li><b>${escapeHtml(e.plugin)}</b>: ${escapeHtml(e.message)}</li>`)
    .join("\n");

  const loadWarningRows = loadWarnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("\n");

  const events = ir.maps.reduce((n, m) => n + m.events.length, 0);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>rmtest 报告 — ${escapeHtml(ir.system.title)}</title>
<style>
  body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; margin: 24px; color: #222; }
  h1 { font-size: 20px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 16px; }
  .summary span { margin-right: 16px; font-weight: bold; }
  .summary .error { color: #c0392b; } .summary .warning { color: #b9770e; } .summary .info { color: #2471a3; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; }
  tr.sev-error { background: #fdf0ef; } tr.sev-warning { background: #fdf8ec; } tr.sev-info { background: #eef6fb; }
  .ev pre { margin: 0; font-size: 11px; color: #555; }
  ul { font-size: 13px; }
</style>
</head>
<body>
<h1>rmtest 报告 — ${escapeHtml(ir.system.title)}</h1>
<div class="meta">
  引擎 ${ir.engine} · 地图 ${ir.maps.length} · 事件 ${events} · 开关 ${ir.system.switches.length - 1} · 变量 ${ir.system.variables.length - 1}<br>
  内容指纹 ${escapeHtml(fingerprint)} · 生成时间 ${generatedAt.toLocaleString("zh-CN")}
</div>
<div class="summary">
  <span class="error">错误 ${counts.error}</span><span class="warning">警告 ${counts.warning}</span><span class="info">提示 ${counts.info}</span>
</div>
${pluginErrors.length > 0 ? `<h2>插件错误（${pluginErrors.length}）</h2><ul>${pluginErrorRows}</ul>` : ""}
${loadWarnings.length > 0 ? `<h2>加载警告（${loadWarnings.length}）</h2><ul>${loadWarningRows}</ul>` : ""}
<h2>检查结果（${sorted.length}）</h2>
<table>
<thead><tr><th>严重度</th><th>类型</th><th>置信度</th><th>位置</th><th>说明</th><th>证据</th></tr></thead>
<tbody>
${rows || `<tr><td colspan="6">未发现问题 🎉</td></tr>`}
</tbody>
</table>
</body>
</html>
`;
}
