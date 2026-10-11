/**
 * 对话溢出估算 —— 基于字体度量模型（启发式，中置信）。
 * MV/MZ 默认：窗口 816 宽、内边距 18、全角字宽 28px（半角 14px）、脸图 144 宽。
 * 度量单位统一为像素：全角字 28px、半角 14px，可用宽度 = 窗口 − 两侧内边距 − 脸图。
 * 控制符（\N[1] 等）剔除后测量。
 *
 * 仅对 MV/MZ 生效：其它引擎窗口与字体度量未建模（VX Ace 窗口 544 宽、字号更小），
 * 用 MV 常量去量会产生系统性误报（实测单个 VX Ace 工程会刷出上万条），故直接空转。
 */
import { Cmd, type CheckerPlugin, type IRDocument, type ReportSection } from "@rmtest/core";
import { core } from "../i18n/core.ts";

const SCREEN_W = 816;
const PADDING = 18;
/** 全角字宽；半角按半宽计 */
const FULL_WIDTH_PX = 28;
const HALF_WIDTH_PX = FULL_WIDTH_PX / 2;
const FACE_WIDTH_PX = 144;

const CJK = /[\u2e80-\u9fff\uac00-\ud7a3\uf900-\ufaff\uff00-\uffef]/;

/** 剔除消息控制符：\N[1] \C[2] \. \| \! \> \< \^ \$ \\ \{ \} */
function stripCodes(line: string): string {
  return line.replace(/\\[A-Za-z]{1,2}\[\d*\]/g, "").replace(/\\./g, "");
}

/** 行宽（像素）：全角/半角分别计量 */
function textWidthPx(line: string): number {
  let px = 0;
  for (const ch of stripCodes(line)) px += CJK.test(ch) ? FULL_WIDTH_PX : HALF_WIDTH_PX;
  return px;
}

function usableWidthPx(hasFace: boolean): number {
  return SCREEN_W - PADDING * 2 - (hasFace ? FACE_WIDTH_PX : 0);
}

/** 扫描一段命令列表里的 101/401 对话行（地图事件页与公共事件共用） */
function checkDialogue(
  commands: readonly { code: number; parameters: readonly unknown[] }[],
  location: ReportSection["location"],
  push: (section: ReportSection) => void,
): void {
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]!;
    if (cmd.code !== Cmd.ShowText) continue;
    const faceName = String(cmd.parameters[0] ?? "");
    const capacity = usableWidthPx(faceName !== "");
    // 401 续行紧跟 101
    for (let j = i + 1; j < commands.length && commands[j]!.code === Cmd.ShowTextCont; j++) {
      const line = String(commands[j]!.parameters[0] ?? "");
      const width = textWidthPx(line);
      if (width > capacity) {
        push({
          type: "text-overflow",
          severity: "warning",
          confidence: "medium",
          location: { ...location, commandIndex: j },
          ...core("checker.core.textOverflow", { width, capacity }),
          evidence: { line, width, capacity },
        });
      }
    }
  }
}

export const textOverflowChecker: CheckerPlugin = {
  manifest: { name: "text-overflow", version: "0.1.0", irVersion: 1, facts: [] },
  check(_facts, ir: IRDocument) {
    if (ir.engine !== "mv" && ir.engine !== "mz") return [];
    const sections: ReportSection[] = [];
    const push = (section: ReportSection) => sections.push(section);

    for (const map of ir.maps) {
      for (const ev of map.events) {
        for (const page of ev.pages) {
          checkDialogue(page.commands, { mapId: map.id, eventId: ev.id, pageIndex: page.index }, push);
        }
      }
    }
    for (const ce of ir.commonEvents) {
      checkDialogue(ce.commands, { dataKey: "commonEvent", dataId: ce.id }, push);
    }
    return sections;
  },
};
