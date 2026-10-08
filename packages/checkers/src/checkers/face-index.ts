/**
 * 脸图索引越界检查 —— 引用的 faceIndex 超出脸图文件实际格数。
 * 扫描：角色定义、Show Text(101)、Change Actor Images(322)。
 */
import { Cmd, type CheckerPlugin, type GameUniverse, type IRDocument, type ReportSection } from "@rmtest/core";
import { walkCommands } from "@rmtest/core";
import type { AssetRecord } from "../asset.ts";

export interface FaceFacts {
  universe: GameUniverse;
  assets: AssetRecord[];
}

function faceCount(assets: Map<string, AssetRecord>, name: string): number | null {
  if (!name) return null;
  const info = assets.get(`img/faces/${name}.png`);
  if (!info) return null; // 缺失由 dangling-ref 报
  return Math.floor(info.width / 144) * Math.floor(info.height / 144);
}

export const faceIndexChecker: CheckerPlugin = {
  manifest: { name: "face-index", version: "0.1.0", irVersion: 1, facts: ["universe", "assets"] },
  check(facts, ir: IRDocument) {
    const { assets } = facts as unknown as FaceFacts;
    const byPath = new Map(assets.map((a) => [a.relPath, a]));
    const sections: ReportSection[] = [];

    const check = (name: string, index: number, loc: ReportSection["location"]) => {
      const count = faceCount(byPath, name);
      if (count !== null && index >= count) {
        sections.push({
          type: "face-index",
          severity: "error",
          confidence: "high",
          location: loc,
          message: `脸图 ${name} 共 ${count} 张脸，引用了索引 ${index}（越界，显示为空脸）`,
          evidence: { faceName: name, faceIndex: index, count },
        });
      }
    };

    for (const actor of ir.actors) {
      check(actor.faceName, actor.faceIndex, { dataKey: "actor", dataId: actor.id });
    }
    for (const map of ir.maps) {
      for (const ev of map.events) {
        for (const page of ev.pages) {
          const loc = { mapId: map.id, eventId: ev.id, pageIndex: page.index };
          walkCommands(page.commands, loc, (cmd, cmdLoc) => {
            if (cmd.code === Cmd.ShowText) {
              check(String(cmd.parameters[0] ?? ""), Number(cmd.parameters[1] ?? 0), cmdLoc);
            } else if (cmd.code === Cmd.ChangeActorImages) {
              check(String(cmd.parameters[3] ?? ""), Number(cmd.parameters[4] ?? 0), cmdLoc);
            }
          });
        }
      }
    }
    return sections;
  },
};
