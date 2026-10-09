/**
 * TyranoScript（含 TyranoBuilder）数据解析。
 * .ks 场景脚本：*标签 + [tag attr=value] 行首标签 + 纯文本台词。
 * Config.tjs：入口场景/标签（缺省按 TyranoScript 默认 first.ks/*start）。
 */
import type { IRTyranoScenario } from "@rmtest/core";

/** 属性提取：name="v" / name='v' / name=v（v 不含空白与 ]） */
const ATTR_RE = /([a-zA-Z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g;

/** 行内标签扫描（[link] 可嵌在台词中间） */
const TAG_RE = /\[([a-zA-Z0-9_]+)([^\]]*)\]/g;

/** 引用资产的标签 → 资产类别 */
const ASSET_TAGS: Record<string, IRTyranoScenario["labels"][number]["assets"][number]["kind"]> = {
  bg: "bg",
  image: "image",
  chara_new: "fg",
  chara_mod: "fg",
  playbgm: "bgm",
  playse: "se",
  playvoice: "voice",
  video: "video",
};

const JUMP_TAGS = new Set(["jump", "call", "button", "link"]);

function parseAttrs(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(ATTR_RE)) out[m[1]!] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** 目标标签名：去 * 前缀；动态表达式（&…）或空 → null */
function normalizeTarget(t: string | undefined): string | null {
  if (!t) return null;
  if (t.startsWith("&")) return null;
  if (t.startsWith("*")) t = t.slice(1);
  return t.length > 0 ? t : null;
}

/** 资产/场景文件名：动态表达式与外部资源跳过 */
function literalOrNull(s: string | undefined): string | null {
  if (!s) return null;
  if (s.startsWith("&") || s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) return null;
  return s;
}

export function parseScenario(file: string, text: string): IRTyranoScenario {
  const lines = text.split(/\r?\n/);
  const labels: IRTyranoScenario["labels"] = [];
  const syntaxErrors: IRTyranoScenario["syntaxErrors"] = [];
  let cur: IRTyranoScenario["labels"][number] | null = null;
  let seenCondition = false;
  const stack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    // 注释：; 起始（截断行内 ; 注释——Tyrano 台词中的 ; 需转义，属正常取舍）
    const line = lines[i]!.split(";")[0]!;

    const lm = line.match(/^\*([^\s*]+)/);
    if (lm) {
      cur = { name: lm[1]!.trim(), line: lineNo, jumps: [], assets: [] };
      labels.push(cur);
      seenCondition = false;
      continue;
    }

    for (const m of line.matchAll(TAG_RE)) {
      const tag = m[1]!;
      const attrs = parseAttrs(m[2]!);
      switch (tag) {
        case "if":
          stack.push("if");
          seenCondition = true;
          break;
        case "elsif":
        case "else":
          seenCondition = true;
          break;
        case "endif":
          if (stack.pop() !== "if") syntaxErrors.push({ line: lineNo, message: "endif 没有匹配的 if" });
          break;
        case "macro":
          stack.push("macro");
          break;
        case "endmacro":
          if (stack.pop() !== "macro") syntaxErrors.push({ line: lineNo, message: "endmacro 没有匹配的 macro" });
          break;
        case "jump":
        case "call":
        case "button":
        case "link":
          if (cur) {
            cur.jumps.push({
              kind: tag,
              target: normalizeTarget(attrs["target"]),
              storage: literalOrNull(attrs["storage"]),
              precededByCondition: seenCondition,
              line: lineNo,
            });
          }
          break;
        default: {
          const kind = ASSET_TAGS[tag];
          if (kind && cur) cur.assets.push({ kind, storage: literalOrNull(attrs["storage"]), line: lineNo });
        }
      }
    }
  }
  if (stack.length > 0) {
    syntaxErrors.push({ line: lines.length, message: `${stack.length} 个块（if/macro）未闭合` });
  }
  return { file, labels, syntaxErrors };
}

export interface TyranoConfig {
  firstScenario: string;
  firstLabel: string;
  title: string;
}

export function parseConfig(text: string | null): TyranoConfig {
  const get = (re: RegExp, def: string) => (text ? (text.match(re)?.[1] ?? def) : def);
  return {
    firstScenario: get(/firstScenario\s*=\s*"([^"]+)"/, "first.ks"),
    firstLabel: get(/firstLabel\s*=\s*"(\*[^"]*)"/, "*start"),
    title: get(/title\s*=\s*"([^"]+)"/, ""),
  };
}
