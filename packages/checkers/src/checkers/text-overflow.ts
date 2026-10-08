/**
 * 对话溢出估算 —— 基于字体度量模型（启发式，中置信）。
 * MV 默认：窗口 816 宽、内边距 18、字号 28、脸图 144 宽；中文按 2 字宽计。
 * 控制符（\N[1] 等）剔除后测量。
 */
import { Cmd, type CheckerPlugin, type IRDocument, type ReportSection } from "@rmtest/core";

const SCREEN_W = 816;
const PADDING = 18;
const FONT_SIZE = 28;
const FACE_WIDTH = 144;

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** 剔除消息控制符：\N[1] \C[2] \. \| \! \> \< \^ \$ \\ \{ \} */
function stripCodes(line: string): string {
  return line.replace(/\\[A-Za-z]{1,2}\[\d*\]/g, "").replace(/\\./g, "");
}

function measureWidth(line: string): number {
  let w = 0;
  for (const ch of stripCodes(line)) w += CJK.test(ch) ? 2 : 1;
  return w;
}

export const textOverflowChecker: CheckerPlugin = {
  manifest: { name: "text-overflow", version: "0.1.0", irVersion: 1, facts: [] },
  check(_facts, ir: IRDocument) {
    const sections: ReportSection[] = [];
    for (const map of ir.maps) {
      for (const ev of map.events) {
        for (const page of ev.pages) {
          const loc = { mapId: map.id, eventId: ev.id, pageIndex: page.index };
          const commands = page.commands;
          for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i]!;
            if (cmd.code !== Cmd.ShowText) continue;
            const faceName = String(cmd.parameters[0] ?? "");
            const capacity = Math.floor((SCREEN_W - PADDING * 2 - (faceName ? FACE_WIDTH : 0)) / FONT_SIZE);
            // 401 续行紧跟 101
            for (let j = i + 1; j < commands.length && commands[j]!.code === Cmd.ShowTextCont; j++) {
              const line = String(commands[j]!.parameters[0] ?? "");
              const w = measureWidth(line);
              if (w > capacity) {
                sections.push({
                  type: "text-overflow",
                  severity: "warning",
                  confidence: "medium",
                  location: { ...loc, commandIndex: j },
                  message: `对话行宽约 ${w} 字，窗口容量约 ${capacity} 字，可能溢出换行异常`,
                  evidence: { line, width: w, capacity },
                });
              }
            }
          }
        }
      }
    }
    for (const ce of ir.commonEvents) {
      const loc = { dataKey: "commonEvent", dataId: ce.id };
      const commands = ce.commands;
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i]!;
        if (cmd.code !== Cmd.ShowText) continue;
        const faceName = String(cmd.parameters[0] ?? "");
        const capacity = Math.floor((SCREEN_W - PADDING * 2 - (faceName ? FACE_WIDTH : 0)) / FONT_SIZE);
        for (let j = i + 1; j < commands.length && commands[j]!.code === Cmd.ShowTextCont; j++) {
          const line = String(commands[j]!.parameters[0] ?? "");
          const w = measureWidth(line);
          if (w > capacity) {
            sections.push({
              type: "text-overflow",
              severity: "warning",
              confidence: "medium",
              location: { ...loc, commandIndex: j },
              message: `对话行宽约 ${w} 字，窗口容量约 ${capacity} 字，可能溢出换行异常`,
              evidence: { line, width: w, capacity },
            });
          }
        }
      }
    }
    return sections;
  },
};
