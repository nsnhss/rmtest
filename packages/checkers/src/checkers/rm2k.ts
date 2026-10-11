/**
 * RM2k/2k3 静态检查器。只在 IR 含 rm2k 段时产出报告。
 * 命令码与参数语义依据 liblcf eventcommand.h + EasyRPG Player 解释器实证：
 * - Teleport=10810 [map,x,y,?,dir]；PlayBGM=11510（string=音乐名）；CallCommonEvent=1005 [id]；
 * - ControlSwitches=10210 [mode,start,end,on]；ControlVars=10220 [mode,start,end,op]；
 * - ChangeMapTileset=11710 [chipset]；ChangeEventLocation=10860 [event,x,y]；CallEvent=12330 [mode,event]…
 * 文件名匹配大小写与扩展名均不敏感（2k/2k3 磁盘文件惯例小写）。
 */
import type { CheckerPlugin, IRRm2kCommand, IRRm2kSection, ReportSection } from "@rmtest/core";
import type { LocalizableMessage } from "@rmtest/i18n";
import { rm2k } from "../i18n/rm2k.ts";

type RSection = IRRm2kSection;

const NO_SECTIONS: ReportSection[] = [];

function sec(
  type: string,
  severity: ReportSection["severity"],
  confidence: ReportSection["confidence"],
  message: LocalizableMessage,
  evidence?: unknown,
): ReportSection {
  return {
    type,
    severity,
    confidence,
    message: message.message,
    messageId: message.messageId,
    messageParams: message.messageParams,
    evidence,
  };
}

const CODE = {
  teleport: 10810,
  controlSwitches: 10210,
  controlVars: 10220,
  callCommonEvent: 1005,
  callEvent: 12330,
  playBgm: 11510,
  playSound: 11550,
  showPicture: 11110,
  movePicture: 11120,
  changeSpriteAssociation: 10630,
  changeActorFace: 10640,
  changeVehicleGraphic: 10650,
  changeSystemGraphics: 10680,
  changeMapTileset: 11710,
  changePbg: 11720,
  changeEventLocation: 10860,
  showBattleAnimation: 11210,
  changeBattleBg: 13210,
} as const;

/** 命令码 → 资产目录（string 为文件名） */
const STRING_ASSET_DIR: Record<number, string> = {
  [CODE.playBgm]: "music",
  [CODE.playSound]: "sound",
  [CODE.showPicture]: "picture",
  [CODE.movePicture]: "picture",
  [CODE.changeSpriteAssociation]: "charset",
  [CODE.changeActorFace]: "faceset",
  [CODE.changeVehicleGraphic]: "charset",
  [CODE.changeSystemGraphics]: "system",
  [CODE.changePbg]: "panorama",
  [CODE.changeBattleBg]: "battle2",
};

function basenameLower(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  return base.toLowerCase();
}

function hasAsset(t: RSection, dir: string, name: string): boolean {
  if (name.length === 0) return true; // 空名 = 无素材，不报
  const needle = basenameLower(name);
  const files = t.assetDirs[dir] ?? [];
  return files.some((f) => basenameLower(f) === needle);
}

/** 遍历工程内所有命令（地图事件 + 公共事件） */
function forEachCommand(
  t: RSection,
  visit: (cmd: IRRm2kCommand, where: LocalizableMessage) => void,
): void {
  for (const map of t.maps) {
    for (const ev of map.events) {
      for (let p = 0; p < ev.pages.length; p++) {
        const where = rm2k("checker.rm2k.locationEventPage", {
          mapId: map.id,
          eventId: ev.id,
          name: ev.name || "",
          page: p + 1,
        });
        for (const cmd of ev.pages[p]!.commands) visit(cmd, where);
      }
    }
  }
  for (const ce of t.commonEvents) {
    const where = rm2k("checker.rm2k.locationCommonEvent", { id: ce.id, name: ce.name || "" });
    for (const cmd of ce.commands) visit(cmd, where);
  }
}

function rangeOk(id: number, count: number): boolean {
  return id >= 1 && id <= count;
}

/** 传送/起始位置：目标地图存在、非区域、坐标在界内 */
export const rm2kTeleportChecker: CheckerPlugin = {
  manifest: { name: "rm2k-teleport", version: "0.1.0", irVersion: 5, facts: [] },
  check(_facts, ir) {
    const t = ir.rm2k;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    const treeById = new Map(t.mapTree.map((m) => [m.id, m]));
    const mapById = new Map(t.maps.map((m) => [m.id, m]));

    const checkTarget = (mapId: number, x: number, y: number, where: LocalizableMessage) => {
      const info = treeById.get(mapId);
      if (!info) {
        out.push(
          sec(
            "rm2k-teleport",
            "error",
            "high",
            rm2k("checker.rm2k.teleportMissingTarget", { where, mapId }),
          ),
        );
        return;
      }
      if (info.type !== 1) {
        out.push(
          sec(
            "rm2k-teleport",
            "warning",
            "medium",
            rm2k("checker.rm2k.teleportTargetNotMap", { where, mapId, name: info.name }),
          ),
        );
        return;
      }
      const map = mapById.get(mapId);
      if (map && (x < 0 || y < 0 || x >= map.width || y >= map.height)) {
        out.push(
          sec(
            "rm2k-teleport",
            "error",
            "high",
            rm2k("checker.rm2k.teleportOutOfBounds", {
              where,
              mapId,
              x,
              y,
              width: map.width,
              height: map.height,
            }),
          ),
        );
      }
    };

    forEachCommand(t, (cmd, where) => {
      if (cmd.code === CODE.teleport && cmd.parameters.length >= 3) {
        checkTarget(cmd.parameters[0]!, cmd.parameters[1]!, cmd.parameters[2]!, where);
      }
    });

    const startInfo = treeById.get(t.start.mapId);
    if (!startInfo) {
      out.push(
        sec(
          "rm2k-teleport",
          "error",
          "high",
          rm2k("checker.rm2k.startMapNotInTree", { mapId: t.start.mapId }),
        ),
      );
    } else {
      const startMap = mapById.get(t.start.mapId);
      if (startMap && (t.start.x < 0 || t.start.y < 0 || t.start.x >= startMap.width || t.start.y >= startMap.height)) {
        out.push(
          sec(
            "rm2k-teleport",
            "error",
            "high",
            rm2k("checker.rm2k.startPositionOutOfBounds", {
              x: t.start.x,
              y: t.start.y,
              mapId: t.start.mapId,
              width: startMap.width,
              height: startMap.height,
            }),
          ),
        );
      }
    }
    return out;
  },
};

/** 引用越界：开关/变量/公共事件/图块集/动画/事件 id */
export const rm2kDanglingRefChecker: CheckerPlugin = {
  manifest: { name: "rm2k-dangling-ref", version: "0.1.0", irVersion: 5, facts: [] },
  check(_facts, ir) {
    const t = ir.rm2k;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    const commonEventIds = new Set(t.commonEvents.map((ce) => ce.id));
    const chipsetIds = new Set(Object.keys(t.chipsets).map((k) => parseInt(k, 10)));

    const checkSwitch = (id: number, where: LocalizableMessage) => {
      if (!rangeOk(id, t.switches.length)) {
        out.push(
          sec(
            "rm2k-dangling-ref",
            "error",
            "high",
            rm2k("checker.rm2k.switchOutOfRange", { where, id, count: t.switches.length }),
          ),
        );
      }
    };
    const checkVariable = (id: number, where: LocalizableMessage) => {
      if (!rangeOk(id, t.variables.length)) {
        out.push(
          sec(
            "rm2k-dangling-ref",
            "error",
            "high",
            rm2k("checker.rm2k.variableOutOfRange", { where, id, count: t.variables.length }),
          ),
        );
      }
    };

    for (const map of t.maps) {
      const eventIds = new Set(map.events.map((e) => e.id));
      for (const ev of map.events) {
        for (let p = 0; p < ev.pages.length; p++) {
          const page = ev.pages[p]!;
          const where = rm2k("checker.rm2k.locationEventPage", {
            mapId: map.id,
            eventId: ev.id,
            name: ev.name || "",
            page: p + 1,
          });
          const condWhere = rm2k("checker.rm2k.locationPageCondition", { where });
          for (const sid of page.conditionSwitchIds) checkSwitch(sid, condWhere);
          if (page.conditionVariableId !== null) checkVariable(page.conditionVariableId, condWhere);
          for (const cmd of page.commands) {
            if (cmd.code === CODE.controlSwitches) {
              const [mode, start, end] = cmd.parameters;
              if (mode === 0) {
                checkSwitch(start!, where);
                checkSwitch(end!, where);
              }
            } else if (cmd.code === CODE.controlVars) {
              const [mode, start, end] = cmd.parameters;
              if (mode === 0) {
                checkVariable(start!, where);
                checkVariable(end!, where);
              }
            } else if (cmd.code === CODE.callCommonEvent) {
              const id = cmd.parameters[0]!;
              if (!commonEventIds.has(id)) {
                out.push(
                  sec(
                    "rm2k-dangling-ref",
                    "error",
                    "high",
                    rm2k("checker.rm2k.commonEventMissing", { where, id }),
                  ),
                );
              }
            } else if (cmd.code === CODE.callEvent) {
              const [mode, id] = cmd.parameters;
              if (mode === 0 && !eventIds.has(id!)) {
                out.push(
                  sec(
                    "rm2k-dangling-ref",
                    "error",
                    "high",
                    rm2k("checker.rm2k.localEventMissing", { where, id: id! }),
                  ),
                );
              }
            } else if (cmd.code === CODE.changeEventLocation) {
              const id = cmd.parameters[0]!;
              if (!eventIds.has(id)) {
                out.push(
                  sec(
                    "rm2k-dangling-ref",
                    "error",
                    "high",
                    rm2k("checker.rm2k.moveEventMissing", { where, id }),
                  ),
                );
              }
            } else if (cmd.code === CODE.changeMapTileset) {
              const id = cmd.parameters[0]!;
              if (!chipsetIds.has(id)) {
                out.push(
                  sec(
                    "rm2k-dangling-ref",
                    "error",
                    "high",
                    rm2k("checker.rm2k.tilesetMissing", { where, id }),
                  ),
                );
              }
            } else if (cmd.code === CODE.showBattleAnimation) {
              const id = cmd.parameters[0]!;
              if (id >= 1 && !(id in t.animations)) {
                out.push(
                  sec(
                    "rm2k-dangling-ref",
                    "error",
                    "high",
                    rm2k("checker.rm2k.battleAnimationMissing", { where, id }),
                  ),
                );
              }
            }
          }
        }
      }
    }
    return out;
  },
};

/** 地图树完整性：lmu 无树登记 / 树登记无 lmu / 树中重复 / 孤岛子树 */
export const rm2kMapTreeChecker: CheckerPlugin = {
  manifest: { name: "rm2k-map-tree", version: "0.1.0", irVersion: 5, facts: [] },
  check(_facts, ir) {
    const t = ir.rm2k;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    const treeIds = new Map<number, IRRm2kSection["mapTree"][number]>();
    for (const info of t.mapTree) {
      if (treeIds.has(info.id)) {
        out.push(
          sec("rm2k-map-tree", "error", "high", rm2k("checker.rm2k.duplicateTreeEntry", { id: info.id })),
        );
      }
      treeIds.set(info.id, info);
    }
    const mapIds = new Set(t.maps.map((m) => m.id));

    for (const info of t.mapTree) {
      if (info.type !== 1) continue;
      if (!mapIds.has(info.id)) {
        out.push(
          sec(
            "rm2k-map-tree",
            "error",
            "high",
            rm2k("checker.rm2k.treeEntryMissingMapFile", {
              id: info.id,
              name: info.name || "?",
              file: `Map${String(info.id).padStart(4, "0")}.lmu`,
            }),
          ),
        );
      }
    }
    for (const map of t.maps) {
      if (!treeIds.has(map.id)) {
        out.push(
          sec("rm2k-map-tree", "error", "high", rm2k("checker.rm2k.mapFileNotInTree", { id: map.id })),
        );
      }
    }

    // 父链连通性：从每个地图沿 parent 上溯，必须到达根（parent=0）
    for (const info of t.mapTree) {
      if (info.type !== 1) continue;
      // 环检测集合必须按地图独立：否则同父的后继地图会因祖先已被访问而误判为不连通
      const visited = new Set<number>();
      let cur: number | undefined = info.id;
      let steps = 0;
      while (cur !== undefined && cur !== 0 && steps < t.mapTree.length + 1) {
        if (visited.has(cur)) break;
        visited.add(cur);
        const parent = treeIds.get(cur);
        cur = parent?.parent;
        steps++;
      }
      // cur === undefined 表示父节点未在树中登记（悬空父节点）；cur ≠ 0 还包含成环
      if (cur !== 0) {
        out.push(
          sec(
            "rm2k-map-tree",
            "warning",
            "low",
            rm2k("checker.rm2k.parentChainBroken", { id: info.id, name: info.name || "?" }),
          ),
        );
      }
    }
    return out;
  },
};

/** 素材文件缺失（音乐/音效/图/行走图/脸图/全景/战斗背景，大小写与扩展名不敏感） */
export const rm2kMissingAssetChecker: CheckerPlugin = {
  manifest: { name: "rm2k-missing-asset", version: "0.1.0", irVersion: 5, facts: [] },
  check(_facts, ir) {
    const t = ir.rm2k;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];

    forEachCommand(t, (cmd, where) => {
      const dir = STRING_ASSET_DIR[cmd.code];
      if (dir && cmd.string.length > 0 && !hasAsset(t, dir, cmd.string)) {
        out.push(
          sec(
            "rm2k-missing-asset",
            "error",
            "high",
            rm2k("checker.rm2k.assetMissing", { where, dir, name: cmd.string }),
          ),
        );
      }
    });

    for (const map of t.maps) {
      if (map.parallaxName.length > 0 && !hasAsset(t, "panorama", map.parallaxName)) {
        out.push(
          sec(
            "rm2k-missing-asset",
            "error",
            "high",
            rm2k("checker.rm2k.parallaxMissing", { id: map.id, name: map.parallaxName }),
          ),
        );
      }
      for (const ev of map.events) {
        for (const page of ev.pages) {
          if (page.charsetName.length > 0 && !hasAsset(t, "charset", page.charsetName)) {
            out.push(
              sec(
                "rm2k-missing-asset",
                "error",
                "high",
                rm2k("checker.rm2k.charsetMissing", {
                  id: map.id,
                  eventId: ev.id,
                  name: ev.name || "",
                  charset: page.charsetName,
                }),
              ),
            );
          }
        }
      }
    }
    for (const info of t.mapTree) {
      if (info.type !== 1) continue;
      if (info.musicName.length > 0 && !hasAsset(t, "music", info.musicName)) {
        out.push(
          sec(
            "rm2k-missing-asset",
            "error",
            "high",
            rm2k("checker.rm2k.mapMusicMissing", { id: info.id, name: info.name || "?", music: info.musicName }),
          ),
        );
      }
      if (info.backgroundName.length > 0 && !hasAsset(t, "panorama", info.backgroundName)) {
        out.push(
          sec(
            "rm2k-missing-asset",
            "error",
            "high",
            rm2k("checker.rm2k.mapBackgroundMissing", {
              id: info.id,
              name: info.name || "?",
              background: info.backgroundName,
            }),
          ),
        );
      }
    }
    return out;
  },
};

/** 工程级完整性 */
export const rm2kProjectChecker: CheckerPlugin = {
  manifest: { name: "rm2k-project", version: "0.1.0", irVersion: 5, facts: [] },
  check(_facts, ir) {
    const t = ir.rm2k;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    if (t.mapTree.length === 0) {
      out.push(sec("rm2k-project", "error", "high", rm2k("checker.rm2k.mapTreeEmpty")));
    }
    if (t.maps.length === 0) {
      out.push(sec("rm2k-project", "error", "high", rm2k("checker.rm2k.noMapsLoaded")));
    }
    for (const map of t.maps) {
      if (map.width <= 0 || map.height <= 0) {
        out.push(
          sec(
            "rm2k-project",
            "error",
            "high",
            rm2k("checker.rm2k.mapSizeInvalid", { id: map.id, width: map.width, height: map.height }),
          ),
        );
      }
    }
    return out;
  },
};

export function rm2kCheckers(): CheckerPlugin[] {
  return [rm2kTeleportChecker, rm2kDanglingRefChecker, rm2kMapTreeChecker, rm2kMissingAssetChecker, rm2kProjectChecker];
}
