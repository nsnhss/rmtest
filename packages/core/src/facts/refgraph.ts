/**
 * 引用图 facts —— 从 IR 收集全部引用（资源/地图/开关/变量/数据库条目）。
 * 这是悬挂引用检查、生命周期分析、可达性分析的共同地基。
 */
import { Cmd, type IRCommand, type IRDocument } from "../ir.ts";
import type { CommandLocation } from "../walk.ts";
import { walkCommands } from "../walk.ts";
import { isRecord } from "../guards.ts";

export type RefCategory =
  | "asset"
  | "map"
  | "switch"
  | "variable"
  | "commonEvent"
  | "item"
  | "weapon"
  | "armor"
  | "skill"
  | "actor"
  | "troop"
  | "enemy"
  | "class"
  | "tileset";

export interface RefLocation extends CommandLocation {
  commandIndex?: number;
}

export interface Reference {
  category: RefCategory;
  /** asset: 相对路径(如 img/characters/Actor1.png)；数据域: ID 字符串 */
  target: string;
  location: RefLocation;
}

export interface RefGraph {
  refs: Reference[];
}

const AUDIO_DIR: Record<string, string> = {
  bgm: "audio/bgm/",
  bgs: "audio/bgs/",
  me: "audio/me/",
  se: "audio/se/",
};

export function buildRefGraph(ir: IRDocument): RefGraph {
  const refs: Reference[] = [];
  const add = (category: RefCategory, target: string, location: RefLocation) => {
    if (target !== "" && target !== "0") refs.push({ category, target, location });
  };
  const addAsset = (path: string, location: RefLocation) => add("asset", path, location);

  // —— 系统域 ——
  const sys = ir.system;
  add("map", String(sys.startMapId), { dataKey: "system" });
  addAsset(assetPath("img/titles1/", sys.title1Name), { dataKey: "system" });
  addAsset(assetPath("img/titles1/", sys.title2Name), { dataKey: "system" });
  for (const kind of ["bgm", "bgs", "me", "se"] as const) {
    addAsset(assetPath(AUDIO_DIR[kind]!, sys.sounds[kind].name, true), { dataKey: "system" });
  }
  for (const kind of ["boat", "ship", "airship"] as const) {
    addAsset(assetPath("img/characters/", sys.vehicles[kind].characterName), { dataKey: "system" });
  }

  // —— 地图域 ——
  for (const map of ir.maps) {
    const mapLoc: RefLocation = { mapId: map.id };
    add("tileset", String(map.tilesetId), mapLoc);
    addAsset(assetPath("img/parallaxes/", map.parallaxName), mapLoc);
    addAsset(assetPath(AUDIO_DIR["bgm"]!, map.bgmName, true), mapLoc);
    addAsset(assetPath(AUDIO_DIR["bgs"]!, map.bgsName, true), mapLoc);
    addAsset(assetPath("img/battlebacks1/", map.battleback1Name), mapLoc);
    addAsset(assetPath("img/battlebacks2/", map.battleback2Name), mapLoc);
    for (const troopId of map.encounterTroopIds) add("troop", String(troopId), mapLoc);

    for (const ev of map.events) {
      for (const page of ev.pages) {
        const pageLoc: RefLocation = { mapId: map.id, eventId: ev.id, pageIndex: page.index };
        const cond = page.conditions;
        if (cond.switch1Id) add("switch", String(cond.switch1Id), pageLoc);
        if (cond.switch2Id) add("switch", String(cond.switch2Id), pageLoc);
        if (cond.variableId) add("variable", String(cond.variableId), pageLoc);
        if (cond.actorId) add("actor", String(cond.actorId), pageLoc);
        if (cond.itemId) add("item", String(cond.itemId), pageLoc);
        walkCommands(page.commands, pageLoc, (cmd, loc) => collectCommandRefs(cmd, loc, add));
      }
    }
  }

  // —— 角色/公共事件/数据库域 ——
  for (const actor of ir.actors) {
    const loc: RefLocation = { dataKey: "actor", dataId: actor.id };
    add("class", String(actor.classId), loc);
    addAsset(assetPath("img/faces/", actor.faceName), loc);
    addAsset(assetPath("img/characters/", actor.characterName), loc);
  }
  for (const ce of ir.commonEvents) {
    const loc: RefLocation = { dataKey: "commonEvent", dataId: ce.id };
    if (ce.switchId) add("switch", String(ce.switchId), loc);
    walkCommands(ce.commands, loc, (cmd, cmdLoc) => collectCommandRefs(cmd, cmdLoc, add));
  }
  for (const ts of ir.tilesets) {
    const loc: RefLocation = { dataKey: "tileset", dataId: ts.id };
    ts.imageNames.slice(1).forEach((name) => addAsset(assetPath("img/tilesets/", name), loc));
  }
  for (const enemy of ir.enemies) {
    addAsset(assetPath("img/enemies/", enemy.battlerName), { dataKey: "enemy", dataId: enemy.id });
  }
  for (const anim of ir.animations) {
    const loc: RefLocation = { dataKey: "animation", dataId: anim.id };
    addAsset(assetPath("img/animations/", anim.image1Name), loc);
    addAsset(assetPath("img/animations/", anim.image2Name), loc);
  }
  for (const troop of ir.troops) {
    const loc: RefLocation = { dataKey: "troop", dataId: troop.id };
    for (const enemyId of troop.enemyIds) add("enemy", String(enemyId), loc);
  }

  return { refs };
}

function collectCommandRefs(
  cmd: IRCommand,
  loc: RefLocation,
  add: (category: RefCategory, target: string, location: RefLocation) => void,
): void {
  const p = cmd.parameters;
  const addAsset = (path: string) => add("asset", path, loc);
  switch (cmd.code) {
    case Cmd.ShowText: {
      // [faceName, faceIndex, bg, position]
      addAsset(assetPath("img/faces/", String(p[0] ?? "")));
      break;
    }
    case Cmd.ConditionalBranch: {
      const type = Number(p[0]);
      if (type === 0) add("switch", String(p[1]), loc);
      else if (type === 1) add("variable", String(p[1]), loc);
      else if (type === 4) add("actor", String(p[1]), loc);
      break;
    }
    case Cmd.CallCommonEvent:
      add("commonEvent", String(p[0]), loc);
      break;
    case Cmd.ControlSwitches:
      for (let id = Number(p[0]); id <= Number(p[1]); id++) add("switch", String(id), loc);
      break;
    case Cmd.ControlVariables:
      for (let id = Number(p[0]); id <= Number(p[1]); id++) add("variable", String(id), loc);
      break;
    case Cmd.ChangeItems:
      add("item", String(p[0]), loc);
      break;
    case Cmd.ChangeWeapons:
      add("weapon", String(p[0]), loc);
      break;
    case Cmd.ChangeArmors:
      add("armor", String(p[0]), loc);
      break;
    case Cmd.ChangePartyMember:
    case Cmd.RecoverAll:
      add("actor", String(p[0]), loc);
      break;
    case Cmd.TransferPlayer:
      add("map", String(p[0]), loc);
      break;
    case Cmd.SetMoveRoute: {
      // p[0] = { list: [{code:41, parameters:[characterName, characterIndex]}, ...] }
      const route = isRecord(p[0]) ? p[0] : null;
      const list = route && Array.isArray(route["list"]) ? (route["list"] as unknown[]) : [];
      for (const step of list) {
        if (isRecord(step) && Number(step["code"]) === 41) {
          const params = Array.isArray(step["parameters"]) ? (step["parameters"] as unknown[]) : [];
          addAsset(assetPath("img/characters/", String(params[0] ?? "")));
        }
      }
      break;
    }
    case Cmd.ShowPicture:
      // [pictureId, name, origin, x, y, ...]
      addAsset(assetPath("img/pictures/", String(p[1] ?? "")));
      break;
    case Cmd.ChangeBgm:
      addAsset(audioRef("audio/bgm/", p[0]));
      break;
    case Cmd.ChangeBgs:
      addAsset(audioRef("audio/bgs/", p[0]));
      break;
    case Cmd.ChangeMe:
      addAsset(audioRef("audio/me/", p[0]));
      break;
    case Cmd.ChangeSe:
      addAsset(audioRef("audio/se/", p[0]));
      break;
    case Cmd.PlayMovie:
      addAsset(assetPath("movies/", String(p[0] ?? ""), true));
      break;
    case Cmd.BattleProcessing:
      add("troop", String(p[0]), loc);
      break;
    case Cmd.ShopProcessing: {
      const goods = Array.isArray(p[0]) ? (p[0] as unknown[]) : [];
      for (const g of goods) {
        if (!Array.isArray(g)) continue;
        const type = Number(g[0]);
        const id = Number(g[1]);
        if (type === 0) add("item", String(id), loc);
        else if (type === 1) add("weapon", String(id), loc);
        else if (type === 2) add("armor", String(id), loc);
      }
      break;
    }
    case Cmd.ChangeActorImages:
      // [actorId, characterName, characterIndex, faceName, faceIndex]
      add("actor", String(p[0]), loc);
      addAsset(assetPath("img/characters/", String(p[1] ?? "")));
      addAsset(assetPath("img/faces/", String(p[3] ?? "")));
      break;
    default:
      break;
  }
}

/** 音频参数是 {name, ...} 对象 */
function audioRef(dir: string, raw: unknown): string {
  if (!isRecord(raw)) return "";
  return assetPath(dir, String(raw["name"] ?? ""), true);
}

/** 拼资源相对路径；空名返回空串。audio/movie 无扩展名后缀 */
function assetPath(dir: string, name: string, noExt = false): string {
  if (!name) return "";
  return noExt ? `${dir}${name}` : `${dir}${name}.png`;
}
