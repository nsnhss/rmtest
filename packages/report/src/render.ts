/**
 * HTML 报告渲染 —— 类型化 section 的展示层。
 * 未知 section 类型优雅降级为通用行，不崩；文案走 @rmtest/i18n（中文 / 日本語 / 한국어 / English）。
 */
import { BCP47, DEFAULT_LOCALE, localizeMessage, t, type Locale } from "@rmtest/i18n";
import { formatLocation, type IRDocument, type LocationLabels, type ReportSection } from "@rmtest/core";

export interface RenderInput {
  ir: IRDocument;
  sections: ReportSection[];
  fingerprint: string;
  loadWarnings: string[];
  pluginErrors: { plugin: string; message: string }[];
  generatedAt?: Date;
  /** 报告语言，默认中文 */
  locale?: Locale;
}

const SEVERITY_ORDER: Record<ReportSection["severity"], number> = { error: 0, warning: 1, info: 2 };

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 位置列文案：文案在目录里，拼装逻辑仍在 core（单一来源） */
function locationLabels(locale: Locale): LocationLabels {
  const data: Record<string, string> = {};
  for (const key of ["system", "actor", "commonEvent", "tileset", "enemy", "animation", "troop", "item", "skill"]) {
    data[key] = t(locale, `report.data.${key}`);
  }
  return {
    map: t(locale, "report.location.map"),
    event: t(locale, "report.location.event"),
    page: t(locale, "report.location.page"),
    command: t(locale, "report.location.command"),
    unknown: t(locale, "report.location.unknown"),
    sep: t(locale, "report.location.sep"),
    data,
  };
}

export function renderReport(input: RenderInput): string {
  const { ir, sections, fingerprint, loadWarnings, pluginErrors, generatedAt = new Date() } = input;
  const locale = input.locale ?? DEFAULT_LOCALE;
  const locLabels = locationLabels(locale);
  const sorted = [...sections].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.type.localeCompare(b.type),
  );
  const counts = { error: 0, warning: 0, info: 0 };
  for (const s of sorted) counts[s.severity]++;

  const rows = sorted
    .map(
      (s) => `<tr class="sev-${s.severity}">
<td class="sev">${escapeHtml(t(locale, `report.severity.${s.severity}`))}</td>
<td class="type">${escapeHtml(s.type)}</td>
<td class="conf">${escapeHtml(t(locale, `report.confidence.${s.confidence}`))}</td>
<td class="loc">${escapeHtml(formatLocation(s.location, locLabels))}</td>
<td class="msg">${escapeHtml(localizeMessage(s, locale))}</td>
<td class="ev">${s.evidence ? `<pre>${escapeHtml(JSON.stringify(s.evidence, null, 2))}</pre>` : ""}</td>
</tr>`,
    )
    .join("\n");

  const pluginErrorRows = pluginErrors
    .map((e) => `<li><b>${escapeHtml(e.plugin)}</b>: ${escapeHtml(e.message)}</li>`)
    .join("\n");

  const loadWarningRows = loadWarnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("\n");

  const events = ir.maps.reduce((n, m) => n + m.events.length, 0);
  const heading = escapeHtml(t(locale, "report.heading", { project: ir.system.title }));

  return `<!doctype html>
<html lang="${BCP47[locale]}">
<head>
<meta charset="utf-8">
<title>${heading}</title>
<style>
  body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; margin: 24px; color: #222; }
  h1 { font-size: 20px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 16px; }
  .summary span { margin-right: 16px; font-weight: bold; }
  .summary .error { color: #c0392b; } .summary .warning { color: #b9770e; } .summary .info { color: #2471a3; }
  .incomplete { background: #fdf0ef; border: 1px solid #f0c4bf; color: #8c2b20; padding: 8px 10px; font-size: 13px; margin: 12px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; }
  tr.sev-error { background: #fdf0ef; } tr.sev-warning { background: #fdf8ec; } tr.sev-info { background: #eef6fb; }
  .ev pre { margin: 0; font-size: 11px; color: #555; }
  ul { font-size: 13px; }
</style>
</head>
<body>
<h1>${heading}</h1>
<div class="meta">
  ${escapeHtml(
    t(locale, "report.meta", {
      engine: ir.engine,
      maps: ir.maps.length,
      events,
      switches: ir.system.switches.length - 1,
      variables: ir.system.variables.length - 1,
    }),
  )}<br>
  ${escapeHtml(
    t(locale, "report.metaFingerprint", {
      fingerprint,
      time: generatedAt.toLocaleString(BCP47[locale]),
    }),
  )}
</div>
<div class="summary">
  <span class="error">${escapeHtml(t(locale, "report.count.error", { count: counts.error }))}</span><span class="warning">${escapeHtml(t(locale, "report.count.warning", { count: counts.warning }))}</span><span class="info">${escapeHtml(t(locale, "report.count.info", { count: counts.info }))}</span>
</div>
${pluginErrors.length > 0 ? `<div class="incomplete">${escapeHtml(t(locale, "report.incomplete"))}</div>` : ""}
${pluginErrors.length > 0 ? `<h2>${escapeHtml(t(locale, "report.pluginErrors", { count: pluginErrors.length }))}</h2><ul>${pluginErrorRows}</ul>` : ""}
${loadWarnings.length > 0 ? `<h2>${escapeHtml(t(locale, "report.loadWarnings", { count: loadWarnings.length }))}</h2><ul>${loadWarningRows}</ul>` : ""}
<h2>${escapeHtml(t(locale, "report.results", { count: sorted.length }))}</h2>
<table>
<thead><tr><th>${escapeHtml(t(locale, "report.col.severity"))}</th><th>${escapeHtml(t(locale, "report.col.type"))}</th><th>${escapeHtml(t(locale, "report.col.confidence"))}</th><th>${escapeHtml(t(locale, "report.col.location"))}</th><th>${escapeHtml(t(locale, "report.col.message"))}</th><th>${escapeHtml(t(locale, "report.col.evidence"))}</th></tr></thead>
<tbody>
${rows || `<tr><td colspan="6">${escapeHtml(t(locale, "report.none"))}</td></tr>`}
</tbody>
</table>
</body>
</html>
`;
}
