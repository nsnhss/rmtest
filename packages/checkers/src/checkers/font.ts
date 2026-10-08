/**
 * 字体检查 —— CJK 文本 + 无 CJK 字体的组合在移动端/网页部署必缺字。
 * 启发式：fonts/ 只有 MV 默认字体（mplus，无 CJK）且游戏文本含中日韩字符 → 告警。
 * 真值需要字体内容解析，故中置信。
 */
import { Cmd, type CheckerPlugin, type GameUniverse, type IRDocument, type ReportSection } from "@rmtest/core";

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;
/** MV 默认字体（无 CJK 覆盖） */
const DEFAULT_FONTS = new Set(["mplus-1m-regular.ttf", "gamefont.css"]);

function hasCjkText(ir: IRDocument): boolean {
  if (CJK.test(ir.system.title)) return true;
  for (const map of ir.maps) {
    for (const ev of map.events) {
      if (CJK.test(ev.name)) return true;
      for (const page of ev.pages) {
        for (const cmd of page.commands) {
          if (cmd.code === Cmd.ShowTextCont && CJK.test(String(cmd.parameters[0] ?? ""))) return true;
        }
      }
    }
  }
  for (const ce of ir.commonEvents) {
    for (const cmd of ce.commands) {
      if (cmd.code === Cmd.ShowTextCont && CJK.test(String(cmd.parameters[0] ?? ""))) return true;
    }
  }
  return false;
}

export const fontChecker: CheckerPlugin = {
  manifest: { name: "font-check", version: "0.1.0", irVersion: 1, facts: ["universe"] },
  check(facts, ir: IRDocument) {
    const universe = facts["universe"] as GameUniverse;
    if (!hasCjkText(ir)) return [];

    // fonts/ 下的文件（相对路径 fonts/...）
    const fonts = [...universe.assetFiles].filter((f) => f.startsWith("fonts/")).map((f) => f.slice("fonts/".length));
    const hasCustomFont = fonts.some((f) => !DEFAULT_FONTS.has(f));

    if (!hasCustomFont) {
      return [
        {
          type: "font-check",
          severity: "warning",
          confidence: "medium",
          location: { dataKey: "system" },
          message: "游戏含中文/日文/韩文文本，但 fonts/ 只有 MV 默认字体（无 CJK 覆盖）——移动端/网页部署会显示方框缺字",
          evidence: { fonts },
        },
      ];
    }
    return [];
  },
};
