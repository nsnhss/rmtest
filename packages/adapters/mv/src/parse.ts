/**
 * MV/MZ 数据文件 → 归一化 IR。
 * 解析必须容错：用户的游戏本来就是有 bug 的，坏数据不能崩掉解析器。
 */
import {
  Cmd,
  IR_SCHEMA_VERSION,
  type IRActor,
  type IRAnimation,
  type IRClass,
  type IRCommonEvent,
  type IRCommand,
  type IRDocument,
  type IREnemy,
  type IREvent,
  type IREventPage,
  type IRItem,
  type IRMap,
  type IRSkill,
  type IRSystem,
  type IRTileset,
  type IRTroop,
} from "@rmtest/core";
import { isRecord, numOrNull, truthy } from "./guards.ts";

export interface ParseResult {
  ir: IRDocument;
  warnings: string[];
}

/** files: 文件名 → 已 JSON.parse 的内容 */
export function parseData(files: Record<string, unknown>, engine: "mv" | "mz" = "mv"): ParseResult {
  const warnings: string[] = [];
  const sys = (files["System.json"] ?? {}) as Record<string, unknown>;

  const system: IRSystem = {
    title: String(sys["gameTitle"] ?? ""),
    switches: normalizeNameList(sys["switches"]),
    variables: normalizeNameList(sys["variables"]),
    startMapId: Number(sys["startMapId"] ?? 0),
    startX: Number(sys["startX"] ?? 0),
    startY: Number(sys["startY"] ?? 0),
    title1Name: String(sys["title1Name"] ?? ""),
    title2Name: String(sys["title2Name"] ?? ""),
    sounds: {
      bgm: audioName(sys["titleBgm"]),
      bgs: audioName(sys["titleBgs"] ?? null),
      me: audioName(sys["gameoverMe"]),
      se: audioName(sys["victoryMe"] ?? null),
    },
    vehicles: {
      boat: vehicleImage(sys["boat"]),
      ship: vehicleImage(sys["ship"]),
      airship: vehicleImage(sys["airship"]),
    },
  };

  const infos = (files["MapInfos.json"] ?? []) as unknown[];
  const maps: IRMap[] = [];
  for (const info of infos) {
    if (!isRecord(info)) continue;
    const id = Number(info["id"]);
    const mapFile = files[mapFileName(id)];
    if (!isRecord(mapFile)) {
      warnings.push(`地图 ${id} (${String(info["name"] ?? "?")}) 在 MapInfos 有登记但缺少数据文件`);
      continue;
    }
    maps.push({
      id,
      name: String(info["name"] ?? ""),
      width: Number(mapFile["width"] ?? 0),
      height: Number(mapFile["height"] ?? 0),
      tilesetId: Number(mapFile["tilesetId"] ?? 0),
      data: Array.isArray(mapFile["data"]) ? (mapFile["data"] as unknown[]).map(Number) : [],
      parallaxName: String(mapFile["parallaxName"] ?? ""),
      bgmName: audioName(mapFile["bgm"]).name,
      bgsName: audioName(mapFile["bgs"]).name,
      battleback1Name: String(mapFile["battleback1Name"] ?? ""),
      battleback2Name: String(mapFile["battleback2Name"] ?? ""),
      encounterTroopIds: parseEncounterList(mapFile["encounterList"]),
      events: parseEvents(mapFile["events"]),
    });
  }

  return {
    ir: {
      schemaVersion: IR_SCHEMA_VERSION,
      engine,
      system,
      maps,
      actors: parseIdList(files["Actors.json"], (a) => ({
        id: Number(a["id"]),
        name: String(a["name"] ?? ""),
        classId: Number(a["classId"] ?? 0),
        faceName: String(a["faceName"] ?? ""),
        faceIndex: Number(a["faceIndex"] ?? 0),
        characterName: String(a["characterName"] ?? ""),
        characterIndex: Number(a["characterIndex"] ?? 0),
      })) satisfies IRActor[],
      commonEvents: parseIdList(files["CommonEvents.json"], (ce) => ({
        id: Number(ce["id"]),
        name: String(ce["name"] ?? ""),
        trigger: Number(ce["trigger"] ?? 0),
        switchId: Number(ce["switchId"] ?? 0) || null,
        commands: parseCommands(ce["list"]),
      })) satisfies IRCommonEvent[],
      tilesets: parseIdList(files["Tilesets.json"], (t) => ({
        id: Number(t["id"]),
        name: String(t["name"] ?? ""),
        imageNames: Array.isArray(t["tilesetNames"]) ? (t["tilesetNames"] as unknown[]).map((n) => String(n ?? "")) : [],
      })) satisfies IRTileset[],
      items: parseIdList(files["Items.json"], parseItem) satisfies IRItem[],
      weapons: parseIdList(files["Weapons.json"], parseItem) satisfies IRItem[],
      armors: parseIdList(files["Armors.json"], parseItem) satisfies IRItem[],
      skills: parseIdList(files["Skills.json"], (s) => ({
        id: Number(s["id"]),
        name: String(s["name"] ?? ""),
        iconIndex: Number(s["iconIndex"] ?? 0),
      })) satisfies IRSkill[],
      troops: parseIdList(files["Troops.json"], (t) => ({
        id: Number(t["id"]),
        name: String(t["name"] ?? ""),
        enemyIds: Array.isArray(t["members"])
          ? (t["members"] as unknown[]).map((m) => (isRecord(m) ? Number(m["enemyId"] ?? 0) : 0)).filter((n) => n > 0)
          : [],
      })) satisfies IRTroop[],
      enemies: parseIdList(files["Enemies.json"], (e) => ({
        id: Number(e["id"]),
        name: String(e["name"] ?? ""),
        battlerName: String(e["battlerName"] ?? ""),
      })) satisfies IREnemy[],
      animations: parseIdList(files["Animations.json"], (a) => ({
        id: Number(a["id"]),
        name: String(a["name"] ?? ""),
        image1Name: String(a["animation1Name"] ?? ""),
        image2Name: String(a["animation2Name"] ?? ""),
      })) satisfies IRAnimation[],
      classes: parseIdList(files["Classes.json"], (c) => ({
        id: Number(c["id"]),
        name: String(c["name"] ?? ""),
      })) satisfies IRClass[],
    },
    warnings,
  };
}

export function mapFileName(id: number): string {
  return `Map${String(id).padStart(3, "0")}.json`;
}

function parseItem(r: Record<string, unknown>): IRItem {
  return { id: Number(r["id"]), name: String(r["name"] ?? ""), iconIndex: Number(r["iconIndex"] ?? 0) };
}

function audioName(raw: unknown): { name: string } {
  return { name: isRecord(raw) ? String(raw["name"] ?? "") : "" };
}

function vehicleImage(raw: unknown): { characterName: string } {
  return { characterName: isRecord(raw) ? String(raw["characterName"] ?? "") : "" };
}

function parseEncounterList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => (isRecord(e) ? Number(e["troopId"] ?? 0) : 0)).filter((n) => n > 0);
}

function parseIdList<T>(raw: unknown, map: (r: Record<string, unknown>) => T): T[] {
  const out: T[] = [];
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    out.push(map(entry));
  }
  return out;
}

function parseEvents(raw: unknown): IREvent[] {
  const out: IREvent[] = [];
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (!isRecord(e)) continue;
    out.push({
      id: Number(e["id"]),
      name: String(e["name"] ?? ""),
      x: Number(e["x"] ?? 0),
      y: Number(e["y"] ?? 0),
      pages: parsePages(e["pages"]),
    });
  }
  return out;
}

function parsePages(raw: unknown): IREventPage[] {
  const out: IREventPage[] = [];
  if (!Array.isArray(raw)) return out;
  let index = 0;
  for (const p of raw) {
    if (!isRecord(p)) continue;
    const c = isRecord(p["conditions"]) ? (p["conditions"] as Record<string, unknown>) : {};
    out.push({
      index,
      conditions: {
        selfSwitchCh: truthy(c["selfSwitchValid"]) ? String(c["selfSwitchCh"] ?? "") : null,
        switch1Id: truthy(c["switch1Valid"]) ? numOrNull(c["switch1Id"]) : null,
        switch2Id: truthy(c["switch2Valid"]) ? numOrNull(c["switch2Id"]) : null,
        variableId: truthy(c["variableValid"]) ? numOrNull(c["variableId"]) : null,
        variableValue: Number(c["variableValue"] ?? 0),
        actorId: truthy(c["actorValid"]) ? numOrNull(c["actorId"]) : null,
        itemId: truthy(c["itemValid"]) ? numOrNull(c["itemId"]) : null,
      },
      trigger: Number(p["trigger"] ?? 0),
      commands: parseCommands(p["list"]),
    });
    index++;
  }
  return out;
}

function parseCommands(raw: unknown): IRCommand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((c) => ({ code: Number(c["code"] ?? 0), indent: Number(c["indent"] ?? 0), parameters: (c["parameters"] ?? []) as unknown[] }));
}

function normalizeNameList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n, i) => (i === 0 ? "" : String(n ?? "")));
}

export { Cmd };
