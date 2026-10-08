/**
 * 图片显示检查 —— 两条启发式：
 * 1. 锚点出屏（滑入动画是常见合法用法，故低置信）
 * 2. Show Picture 后本事件内从未 Erase（可能是有意的常驻图，故 info 级）
 */
import { Cmd, type CheckerPlugin, type IRDocument, type ReportSection } from "@rmtest/core";
import { walkCommands } from "@rmtest/core";

const SCREEN_W = 816;
const SCREEN_H = 624;

export const pictureOffscreenChecker: CheckerPlugin = {
  manifest: { name: "picture-offscreen", version: "0.1.0", irVersion: 1, facts: [] },
  check(_facts, ir: IRDocument) {
    const sections: ReportSection[] = [];
    for (const map of ir.maps) {
      for (const ev of map.events) {
        for (const page of ev.pages) {
          const loc = { mapId: map.id, eventId: ev.id, pageIndex: page.index };
          walkCommands(page.commands, loc, (cmd, cmdLoc) => {
            if (cmd.code !== Cmd.ShowPicture) return;
            const [id, , origin, xRaw, yRaw] = cmd.parameters;
            const x = Number(xRaw);
            const y = Number(yRaw);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            const inside =
              origin === 0 ? x < SCREEN_W && y < SCREEN_H : x >= 0 && x <= SCREEN_W && y >= 0 && y <= SCREEN_H;
            if (!inside) {
              sections.push({
                type: "picture-offscreen",
                severity: "warning",
                confidence: "low",
                location: cmdLoc,
                message: `图片 #${String(id)} 锚点 (${x}, ${y}) 在屏幕外（${SCREEN_W}×${SCREEN_H}）；若为滑入动画请忽略`,
                evidence: { pictureId: id, x, y, origin },
              });
            }
          });
        }
      }
    }
    return sections;
  },
};

export const pictureNoEraseChecker: CheckerPlugin = {
  manifest: { name: "picture-no-erase", version: "0.1.0", irVersion: 1, facts: [] },
  check(_facts, ir: IRDocument) {
    const sections: ReportSection[] = [];
    for (const map of ir.maps) {
      for (const ev of map.events) {
        for (const page of ev.pages) {
          const shown = new Set<number>();
          const erased = new Set<number>();
          const loc = { mapId: map.id, eventId: ev.id, pageIndex: page.index };
          walkCommands(page.commands, loc, (cmd) => {
            if (cmd.code === Cmd.ShowPicture) shown.add(Number(cmd.parameters[0]));
            else if (cmd.code === Cmd.ErasePicture) erased.add(Number(cmd.parameters[0]));
          });
          for (const id of shown) {
            if (!erased.has(id)) {
              sections.push({
                type: "picture-no-erase",
                severity: "info",
                confidence: "low",
                location: loc,
                message: `事件显示图片 #${id} 但从未 Erase，事件结束后常驻屏幕；若为常驻 UI 请忽略`,
                evidence: { pictureId: id },
              });
            }
          }
        }
      }
    }
    return sections;
  },
};
