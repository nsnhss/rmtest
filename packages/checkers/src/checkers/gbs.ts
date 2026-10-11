/**
 * GB Studio 静态检查器。
 * 只在 IR 含 gbs 段时产出报告；其他引擎工程一律空转。
 * 命令名与参数键依据 chrismaltby/gb-studio 的 src/lib/events/ 事件定义实证。
 */
import type { CheckerPlugin, IRGBSScriptEvent, IRGBSSection, ReportSection } from "@rmtest/core";
import type { LocalizableMessage } from "@rmtest/i18n";
import { gbs } from "../i18n/gbs.ts";

type GSection = IRGBSSection;

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

/* ---- 命令分类与哨兵值 ---- */

const ACTOR_CMDS = new Set([
  "EVENT_ACTOR_MOVE_TO",
  "EVENT_ACTOR_SET_POSITION",
  "EVENT_ACTOR_GET_POSITION",
  "EVENT_ACTOR_SET_DIRECTION",
  "EVENT_ACTOR_GET_DIRECTION",
  "EVENT_ACTOR_SET_SPRITE",
  "EVENT_ACTOR_SHOW",
  "EVENT_ACTOR_HIDE",
  "EVENT_ACTOR_EMOTE",
  "EVENT_ACTOR_PUSH",
  "EVENT_ACTOR_ACTIVATE",
  "EVENT_ACTOR_DEACTIVATE",
  "EVENT_ACTOR_INVOKE",
  "EVENT_ACTOR_SET_ANIMATION_SPEED",
  "EVENT_ACTOR_SET_MOVEMENT_SPEED",
  "EVENT_ACTOR_SET_POSITION_RELATIVE",
  "EVENT_ACTOR_MOVE_RELATIVE",
  "EVENT_ACTOR_MOVE_TO_VARIABLES",
  "EVENT_ACTOR_SET_POSITION_TO_VARIABLES",
  "EVENT_ACTOR_SET_FRAME",
  "EVENT_ACTOR_SET_FRAME_TO_VARIABLE",
  "EVENT_ACTOR_SET_STATE",
  "EVENT_ACTOR_SET_COLLISION_BOX",
  "EVENT_ACTOR_COLLISIONS_ENABLE",
  "EVENT_ACTOR_COLLISIONS_DISABLE",
  "EVENT_ACTOR_SET_ANIMATE",
  "EVENT_ACTOR_START_UPDATE_SCRIPT",
  "EVENT_ACTOR_STOP_UPDATE_SCRIPT",
  "EVENT_ACTOR_SET_PIN_TO_SCREEN",
]);

const OTHER_ACTOR_CMDS = new Set(["EVENT_IF_ACTOR_DISTANCE_FROM_ACTOR", "EVENT_IF_ACTOR_RELATIVE_TO_ACTOR"]);
const SCENE_CMDS = new Set(["EVENT_SWITCH_SCENE", "EVENT_SET_SCENE"]);
const SPRITE_CMDS = new Set(["EVENT_PLAYER_SET_SPRITE", "EVENT_ACTOR_SET_SPRITE", "EVENT_SET_UI"]);
const MUSIC_CMDS = new Set(["EVENT_MUSIC_PLAY"]);
const SOUND_CMDS = new Set(["EVENT_SOUND_PLAY_EFFECT"]);
const EMOTE_CMDS = new Set(["EVENT_ACTOR_EMOTE"]);
const FONT_CMDS = new Set(["EVENT_SET_FONT"]);
const AVATAR_CMDS = new Set(["EVENT_TEXT_DIALOGUE"]);
const PALETTE_CMDS = new Set([
  "EVENT_PALETTE_SET_SPRITE",
  "EVENT_PALETTE_SET_BACKGROUND",
  "EVENT_PALETTE_SET_UI",
  "EVENT_PALETTE_SET_EMOTE",
]);
const LABEL_GOTO_CMDS = new Set(["EVENT_GOTO_LABEL"]);
const LABEL_DEFINE_CMDS = new Set(["EVENT_LABEL_DEFINE"]);

const SOUND_BUILTINS = new Set(["beep", "tone", "crash"]);

function refValue(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (v.length === 0) return null;
  if (v.startsWith("$")) return null; // $self$ / $actor[N]$
  return v;
}

/** 参数取值：GB Studio 值对象 {type:"number"|"variable"|…, value} 或裸值；返回字面量数字或 null */
function literalNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v !== null) {
    const r = v as { type?: unknown; value?: unknown };
    if (r["type"] === "number" && typeof r["value"] === "number") return r["value"];
  }
  return null;
}

function walkEvents(
  events: IRGBSScriptEvent[],
  visit: (ev: IRGBSScriptEvent, path: string) => void,
  path = "",
): void {
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const here = `${path}/${i}`;
    visit(ev, here);
    if (ev.children) {
      for (const [key, child] of Object.entries(ev.children)) {
        if (child) walkEvents(child, visit, `${here}/children.${key}`);
      }
    }
  }
}

function sceneTitle(s: GSection["scenes"][number]): string {
  return s.name.length > 0 ? `${s.name} (${s.id})` : s.id;
}

/** 断链引用：脚本事件 + 场景结构里的 id 全部核对 */
export const gbsBrokenRefChecker: CheckerPlugin = {
  manifest: { name: "gbs-broken-ref", version: "0.1.0", irVersion: 3, facts: [] },
  check(_facts, ir) {
    const t = ir.gbs;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    const scenesById = new Map(t.scenes.map((s) => [s.id, s]));
    const ev = (message: LocalizableMessage, extra?: unknown) =>
      sec("gbs-broken-ref", "error", "high", message, extra);

    const checkGlobal = (e: IRGBSScriptEvent, where: LocalizableMessage) => {
      const { command, args } = e;
      if (SCENE_CMDS.has(command)) {
        const sid = refValue(args["sceneId"]);
        if (sid && sid !== "LAST_SCENE" && !scenesById.has(sid)) {
          out.push(ev(gbs("checker.gbs.sceneRefMissing", { where, command, id: sid })));
        }
      } else if (SPRITE_CMDS.has(command)) {
        const sid = refValue(args["spriteSheetId"]);
        if (sid && sid !== "LAST_SPRITE" && !t.spriteIds.includes(sid)) {
          out.push(ev(gbs("checker.gbs.spriteRefMissing", { where, command, id: sid })));
        }
      } else if (MUSIC_CMDS.has(command)) {
        const mid = refValue(args["musicId"]);
        if (mid && mid !== "LAST_MUSIC" && !t.musicIds.includes(mid)) {
          out.push(ev(gbs("checker.gbs.musicRefMissing", { where, command, id: mid })));
        }
      } else if (SOUND_CMDS.has(command)) {
        const sid = refValue(args["type"]);
        if (sid && !SOUND_BUILTINS.has(sid) && !t.soundIds.includes(sid)) {
          out.push(ev(gbs("checker.gbs.soundRefMissing", { where, command, id: sid })));
        }
      } else if (EMOTE_CMDS.has(command)) {
        const eid = refValue(args["emoteId"]);
        if (eid && !t.emoteIds.includes(eid)) {
          out.push(ev(gbs("checker.gbs.emoteRefMissing", { where, command, id: eid })));
        }
      } else if (FONT_CMDS.has(command)) {
        const fid = refValue(args["fontId"]);
        if (fid && !t.fontIds.includes(fid)) {
          out.push(ev(gbs("checker.gbs.fontRefMissing", { where, command, id: fid })));
        }
      } else if (AVATAR_CMDS.has(command)) {
        const aid = refValue(args["avatarId"]);
        if (aid && !t.avatarIds.includes(aid)) {
          out.push(ev(gbs("checker.gbs.avatarRefMissing", { where, command, id: aid })));
        }
      } else if (PALETTE_CMDS.has(command)) {
        const pid = refValue(args["paletteId"]);
        if (pid && !t.paletteIds.includes(pid)) {
          out.push(ev(gbs("checker.gbs.paletteRefMissing", { where, command, id: pid })));
        }
      }
    };

    const checkActor = (e: IRGBSScriptEvent, where: LocalizableMessage, sceneActorIds: Set<string>) => {
      const aid = refValue(e.args["actorId"]);
      if (aid && !sceneActorIds.has(aid)) {
        out.push(ev(gbs("checker.gbs.actorRefMissing", { where, command: e.command, id: aid })));
      }
      if (OTHER_ACTOR_CMDS.has(e.command)) {
        const oid = refValue(e.args["otherActorId"]);
        if (oid && !sceneActorIds.has(oid)) {
          out.push(ev(gbs("checker.gbs.otherActorRefMissing", { where, command: e.command, id: oid })));
        }
      }
      checkGlobal(e, where);
    };

    for (const s of t.scenes) {
      const where0 = gbs("checker.gbs.locationScene", { scene: sceneTitle(s) });
      const sceneActorIds = new Set(s.actors.map((a) => a.id));
      // 结构引用
      if (s.backgroundId && !t.backgroundIds.includes(s.backgroundId)) {
        out.push(ev(gbs("checker.gbs.backgroundMissing", { where: where0, id: s.backgroundId })));
      }
      if (s.tilesetId && !t.tilesetIds.includes(s.tilesetId)) {
        out.push(ev(gbs("checker.gbs.tilesetMissing", { where: where0, id: s.tilesetId })));
      }
      for (const pid of s.paletteIds) {
        if (pid && !t.paletteIds.includes(pid)) out.push(ev(gbs("checker.gbs.paletteMissing", { where: where0, id: pid })));
      }
      for (const pid of s.spritePaletteIds) {
        if (pid && !t.paletteIds.includes(pid)) out.push(ev(gbs("checker.gbs.spritePaletteMissing", { where: where0, id: pid })));
      }
      if (s.playerSpriteSheetId && s.playerSpriteSheetId !== "LAST_SPRITE" && !t.spriteIds.includes(s.playerSpriteSheetId)) {
        out.push(ev(gbs("checker.gbs.playerSpriteMissing", { where: where0, id: s.playerSpriteSheetId })));
      }
      for (const a of s.actors) {
        const where = gbs("checker.gbs.locationActor", { scene: sceneTitle(s), actor: a.name || a.id });
        if (a.spriteSheetId && a.spriteSheetId !== "LAST_SPRITE" && !t.spriteIds.includes(a.spriteSheetId)) {
          out.push(ev(gbs("checker.gbs.actorSpriteMissing", { where, id: a.spriteSheetId })));
        }
        if (a.paletteId && !t.paletteIds.includes(a.paletteId)) {
          out.push(ev(gbs("checker.gbs.paletteMissing", { where, id: a.paletteId })));
        }
        if (a.prefabId && !t.actorPrefabIds.includes(a.prefabId)) {
          out.push(ev(gbs("checker.gbs.actorPrefabMissing", { where, id: a.prefabId })));
        }
        for (const set of a.scripts) {
          walkEvents(set.events, (e) => checkActor(e, gbs("checker.gbs.locationScript", { where, key: set.key }), sceneActorIds));
        }
      }
      for (const tr of s.triggers) {
        const where = gbs("checker.gbs.locationTrigger", { scene: sceneTitle(s), trigger: tr.name || tr.id });
        if (tr.prefabId && !t.triggerPrefabIds.includes(tr.prefabId)) {
          out.push(ev(gbs("checker.gbs.triggerPrefabMissing", { where, id: tr.prefabId })));
        }
        for (const set of tr.scripts) {
          walkEvents(set.events, (e) => checkActor(e, gbs("checker.gbs.locationScript", { where, key: set.key }), sceneActorIds));
        }
      }
      for (const set of s.scripts) {
        walkEvents(set.events, (e) =>
          checkActor(e, gbs("checker.gbs.locationScript", { where: where0, key: set.key }), sceneActorIds),
        );
      }
    }

    // 自定义事件：只核对全局资源（演员引用依赖调用场景，静态不可解）
    for (const ce of t.customEvents) {
      const where = gbs("checker.gbs.locationCustomEvent", { name: ce.name || ce.id });
      walkEvents(ce.script, (e) => checkGlobal(e, where));
    }

    return out;
  },
};

/** 入口场景缺失 / 越界 / 起始实心 */
export const gbsStartSceneChecker: CheckerPlugin = {
  manifest: { name: "gbs-start-scene", version: "0.1.0", irVersion: 3, facts: [] },
  check(_facts, ir) {
    const t = ir.gbs;
    if (!t) return NO_SECTIONS;
    if (!t.scenes.some((s) => s.id === t.startSceneId)) {
      return [
        sec(
          "gbs-start-scene",
          "error",
          "high",
          t.startSceneId
            ? gbs("checker.gbs.startSceneMissing", { id: t.startSceneId })
            : gbs("checker.gbs.startSceneNotSet"),
        ),
      ];
    }
    return NO_SECTIONS;
  },
};

/** 碰撞软锁：起始/传送/演员生成落在实心瓦片；TOPDOWN 场景 BFS 不可达触发器 */
export const gbsCollisionSoftlockChecker: CheckerPlugin = {
  manifest: { name: "gbs-collision-softlock", version: "0.1.0", irVersion: 3, facts: [] },
  check(_facts, ir) {
    const t = ir.gbs;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    const scenesById = new Map(t.scenes.map((s) => [s.id, s]));

    const solidAt = (s: GSection["scenes"][number], x: number, y: number): boolean => {
      if (s.width <= 0 || s.height <= 0) return false;
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) return false;
      const v = s.collisions[y * s.width + x];
      return v === 1;
    };

    const startScene = scenesById.get(t.startSceneId);
    if (startScene && solidAt(startScene, t.startX, t.startY)) {
      out.push(
        sec(
          "gbs-collision-softlock",
          "error",
          "high",
          gbs("checker.gbs.startPositionSolid", { scene: sceneTitle(startScene), x: t.startX, y: t.startY }),
        ),
      );
    }

    for (const s of t.scenes) {
      // 演员初始位置
      for (const a of s.actors) {
        if (solidAt(s, a.x, a.y)) {
          out.push(
            sec(
              "gbs-collision-softlock",
              "error",
              "high",
              gbs("checker.gbs.actorSpawnSolid", {
                where: gbs("checker.gbs.locationScene", { scene: sceneTitle(s) }),
                actor: a.name || a.id,
                x: a.x,
                y: a.y,
              }),
            ),
          );
        }
      }
      // 场景切换传送目标
      const where = gbs("checker.gbs.locationScene", { scene: sceneTitle(s) });
      const visit = (e: IRGBSScriptEvent, path: string) => {
        if (!SCENE_CMDS.has(e.command)) return;
        const sid = refValue(e.args["sceneId"]);
        if (!sid || sid === "LAST_SCENE") return;
        const target = scenesById.get(sid);
        if (!target) return;
        const x = literalNumber(e.args["x"]);
        const y = literalNumber(e.args["y"]);
        if (x === null || y === null) return; // 变量/动态坐标跳过
        if (solidAt(target, x, y)) {
          out.push(
            sec(
              "gbs-collision-softlock",
              "error",
              "high",
              gbs("checker.gbs.transferSolid", {
                where,
                path,
                command: e.command,
                scene: sceneTitle(target),
                x,
                y,
              }),
            ),
          );
        }
      };
      for (const set of s.scripts) walkEvents(set.events, visit);
      for (const a of s.actors) for (const set of a.scripts) walkEvents(set.events, visit);
      for (const tr of s.triggers) for (const set of tr.scripts) walkEvents(set.events, visit);
    }

    // TOPDOWN BFS：不可达触发器/演员（info，可能由事件移动/传送激活）
    for (const s of t.scenes) {
      if (s.type !== "TOPDOWN" || s.width <= 0 || s.height <= 0 || s.collisions.length < s.width * s.height) continue;
      const walkable = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < s.width && y < s.height && s.collisions[y * s.width + x] !== 1;
      const origin: Array<[number, number]> = [];
      if (s.id === t.startSceneId && walkable(t.startX, t.startY)) origin.push([t.startX, t.startY]);
      const seen = new Set<number>();
      const queue = [...origin];
      if (origin.length > 0) seen.add(t.startY * s.width + t.startX);
      while (queue.length > 0) {
        const [x, y] = queue.pop()!;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          const key = ny * s.width + nx;
          if (walkable(nx, ny) && !seen.has(key)) {
            seen.add(key);
            queue.push([nx, ny]);
          }
        }
      }
      if (seen.size === 0) continue; // 非起始场景或无可行区域
      const reachable = (x: number, y: number) => seen.has(y * s.width + x);
      const where = gbs("checker.gbs.locationScene", { scene: sceneTitle(s) });
      for (const tr of s.triggers) {
        let hit = false;
        for (let dy = 0; dy < tr.height && !hit; dy++) {
          for (let dx = 0; dx < tr.width && !hit; dx++) {
            if (reachable(tr.x + dx, tr.y + dy)) hit = true;
          }
        }
        if (!hit) {
          out.push(
            sec(
              "gbs-collision-softlock",
              "info",
              "low",
              gbs("checker.gbs.triggerUnreachable", { where, trigger: tr.name || tr.id }),
            ),
          );
        }
      }
      for (const a of s.actors) {
        if (!reachable(a.x, a.y)) {
          out.push(
            sec(
              "gbs-collision-softlock",
              "info",
              "low",
              gbs("checker.gbs.actorUnreachable", { where, actor: a.name || a.id }),
            ),
          );
        }
      }
    }

    return out;
  },
};

/** 资产文件缺失（大小写不一致降级 warning） */
export const gbsMissingAssetChecker: CheckerPlugin = {
  manifest: { name: "gbs-missing-asset", version: "0.1.0", irVersion: 3, facts: [] },
  check(_facts, ir) {
    const t = ir.gbs;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    for (const a of t.assetFiles) {
      if (a.exists) continue;
      if (a.caseInsensitiveMatch) {
        out.push(
          sec("gbs-missing-asset", "warning", "low", gbs("checker.gbs.assetCaseMismatch", { file: a.filename }), { id: a.id }),
        );
      } else {
        out.push(sec("gbs-missing-asset", "error", "high", gbs("checker.gbs.assetMissing", { file: a.filename }), { id: a.id }));
      }
    }
    return out;
  },
};

/** EVENT_GOTO_LABEL 指向的标签未在同一脚本集合内定义 */
export const gbsLabelMissingChecker: CheckerPlugin = {
  manifest: { name: "gbs-label-missing", version: "0.1.0", irVersion: 3, facts: [] },
  check(_facts, ir) {
    const t = ir.gbs;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];

    const checkSet = (events: IRGBSScriptEvent[], where: LocalizableMessage) => {
      const defined = new Set<string>();
      walkEvents(events, (e) => {
        if (LABEL_DEFINE_CMDS.has(e.command)) {
          const label = refValue(e.args["label"]);
          if (label) defined.add(label);
        }
      });
      walkEvents(events, (e) => {
        if (!LABEL_GOTO_CMDS.has(e.command)) return;
        const label = refValue(e.args["label"]);
        if (label && !defined.has(label)) {
          out.push(sec("gbs-label-missing", "error", "high", gbs("checker.gbs.labelMissing", { where, label })));
        }
      });
    };

    for (const s of t.scenes) {
      const where0 = gbs("checker.gbs.locationScene", { scene: sceneTitle(s) });
      for (const set of s.scripts) {
        checkSet(set.events, gbs("checker.gbs.locationScript", { where: where0, key: set.key }));
      }
      for (const a of s.actors) {
        const where = gbs("checker.gbs.locationActor", { scene: sceneTitle(s), actor: a.name || a.id });
        for (const set of a.scripts) {
          checkSet(set.events, gbs("checker.gbs.locationScript", { where, key: set.key }));
        }
      }
      for (const tr of s.triggers) {
        const where = gbs("checker.gbs.locationTrigger", { scene: sceneTitle(s), trigger: tr.name || tr.id });
        for (const set of tr.scripts) {
          checkSet(set.events, gbs("checker.gbs.locationScript", { where, key: set.key }));
        }
      }
    }
    for (const ce of t.customEvents) {
      checkSet(ce.script, gbs("checker.gbs.locationCustomEvent", { name: ce.name || ce.id }));
    }

    return out;
  },
};

export function gbsCheckers(): CheckerPlugin[] {
  return [gbsBrokenRefChecker, gbsStartSceneChecker, gbsCollisionSoftlockChecker, gbsMissingAssetChecker, gbsLabelMissingChecker];
}
