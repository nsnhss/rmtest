/**
 * RGSS 数据 → 归一化 IR。
 * VX Ace（rvdata2）优先；XP/VX（rxdata/rvdata）结构同源，用同解析器读。
 * 资产引用统一发射 MV 风格路径（img/... audio/...），全部既有检查器无需改动。
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
import { numValue, parseMarshal, strValue, type MarshalValue } from "./marshal.ts";

export interface ParseResult {
  ir: IRDocument;
  warnings: string[];
}

type Obj = { $class: string; $ivars: Map<string, MarshalValue> };

function asObj(v: MarshalValue | undefined): Obj | null {
  return v && typeof v === "object" && "$ivars" in (v as object) ? (v as Obj) : null;
}

function iv(obj: Obj, name: string): MarshalValue | undefined {
  return obj.$ivars.get(name);
}

function asArray(v: MarshalValue | undefined): MarshalValue[] | null {
  return v && Array.isArray(v) ? v : null;
}

function asPairs(v: MarshalValue | undefined): Array<[MarshalValue, MarshalValue]> | null {
  return v && typeof v === "object" && "$pairs" in (v as object) ? (v as { $pairs: Array<[MarshalValue, MarshalValue]> }).$pairs : null;
}

/** 数组/哈希按索引取值（RGSS 数据 1 起始，0 槽为 null） */
function at(container: MarshalValue | undefined, index: number): MarshalValue | undefined {
  const arr = asArray(container);
  if (arr) return arr[index];
  const pairs = asPairs(container);
  if (pairs) return pairs.find(([k]) => numValue(k) === index)?.[1];
  return undefined;
}

function atInt(container: MarshalValue | undefined, index: number): number {
  return numValue(at(container, index));
}

/** 参数规范化：AudioFile 对象 → 扁平 {name,...}；符号 → 字符串 */
function normParam(v: MarshalValue): unknown {
  const obj = asObj(v);
  if (obj) {
    if (["RPG::AudioFile", "RPG::BGM", "RPG::BGS", "RPG::ME", "RPG::SE"].includes(obj.$class)) {
      return {
        name: strValue(iv(obj, "@name")),
        volume: numValue(iv(obj, "@volume")),
        pitch: numValue(iv(obj, "@pitch")),
        pan: numValue(iv(obj, "@pan")),
      };
    }
    return { $class: obj.$class };
  }
  if (typeof v === "object" && v !== null && "$symbol" in (v as object)) return (v as { $symbol: string }).$symbol;
  return v;
}

function parseCommands(raw: MarshalValue | undefined): IRCommand[] {
  const arr = asArray(raw) ?? [];
  const out: IRCommand[] = [];
  for (const c of arr) {
    const obj = asObj(c);
    if (!obj) continue;
    out.push({
      code: numValue(iv(obj, "@code")),
      indent: numValue(iv(obj, "@indent")),
      parameters: (asArray(iv(obj, "@parameters")) ?? []).map(normParam),
    });
  }
  return out;
}

function parseCondition(raw: MarshalValue | undefined): IREventPage["conditions"] {
  const c = asObj(raw);
  const get = (name: string) => (c ? iv(c, name) : undefined);
  const valid = (name: string) => numValue(get(name)) !== 0 || get(name) === true;
  return {
    selfSwitchCh: valid("@self_switch_valid") ? strValue(get("@self_switch_ch")) || null : null,
    switch1Id: valid("@switch1_valid") ? numValue(get("@switch1_id")) || null : null,
    switch2Id: valid("@switch2_valid") ? numValue(get("@switch2_id")) || null : null,
    variableId: valid("@variable_valid") ? numValue(get("@variable_id")) || null : null,
    variableValue: numValue(get("@variable_value")),
    actorId: valid("@actor_valid") ? numValue(get("@actor_id")) || null : null,
    itemId: valid("@item_valid") ? numValue(get("@item_id")) || null : null,
  };
}

function parsePages(raw: MarshalValue | undefined): IREventPage[] {
  const arr = asArray(raw) ?? [];
  const pages: IREventPage[] = [];
  let index = 0;
  for (const p of arr) {
    const obj = asObj(p);
    if (!obj) continue;
    pages.push({
      index,
      conditions: parseCondition(iv(obj, "@condition")),
      trigger: numValue(iv(obj, "@trigger")),
      commands: parseCommands(iv(obj, "@list")),
    });
    index++;
  }
  return pages;
}

/** VX Ace Table（UserDefined "Table"）解码：头 5×int32（dims,xsize,ysize,zsize,count）+ count×int16 LE */
function decodeTable(raw: MarshalValue | undefined): number[] | null {
  if (!raw || typeof raw !== "object" || !("$user" in (raw as object))) return null;
  const u = raw as { $user?: string; $bytes?: Uint8Array };
  if (u.$user !== "Table" || !u.$bytes) return null;
  const bytes = u.$bytes;
  if (bytes.length < 20) return null;
  const readI32 = (off: number) => (bytes[off]! | (bytes[off + 1]! << 8) | (bytes[off + 2]! << 16) | (bytes[off + 3]! << 24)) | 0;
  const count = readI32(16);
  if (bytes.length < 20 + count * 2) return null;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const off = 20 + i * 2;
    let v = bytes[off]! | (bytes[off + 1]! << 8);
    if (v >= 0x8000) v -= 0x10000; // int16 符号扩展
    out.push(v);
  }
  return out;
}

export function parseData(files: Record<string, Uint8Array>): ParseResult {
  const warnings: string[] = [];
  const parsed: Record<string, MarshalValue> = {};
  for (const [name, bytes] of Object.entries(files)) {
    try {
      parsed[name] = parseMarshal(bytes);
    } catch (err) {
      warnings.push(`数据文件 ${name} 解析失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const system = asObj(parsed["System.rvdata2"] ?? parsed["System.rvdata"]);
  const sys: IRSystem = {
    title: strValue(system ? iv(system, "@game_title") : undefined),
    switches: (asArray(system ? iv(system, "@switches") : undefined) ?? []).map((s, i) => (i === 0 ? "" : strValue(s))),
    variables: (asArray(system ? iv(system, "@variables") : undefined) ?? []).map((s, i) => (i === 0 ? "" : strValue(s))),
    startMapId: numValue(system ? iv(system, "@start_map_id") : undefined),
    startX: numValue(system ? iv(system, "@start_x") : undefined),
    startY: numValue(system ? iv(system, "@start_y") : undefined),
    title1Name: "",
    title2Name: "",
    sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
    vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
  };

  const infos = parsed["MapInfos.rvdata2"] ?? parsed["MapInfos.rvdata"];
  const maps: IRMap[] = [];
  const infoPairs = asPairs(infos) ?? [];
  for (const [key, infoRaw] of infoPairs) {
    const id = numValue(key);
    const info = asObj(infoRaw);
    const mapRaw = parsed[`Map${String(id).padStart(3, "0")}.rvdata2`] ?? parsed[`Map${String(id).padStart(3, "0")}.rvdata`];
    const map = asObj(mapRaw);
    if (!map) {
      warnings.push(`地图 ${id} 有 MapInfos 登记但缺少地图数据文件`);
      continue;
    }
    const events: IREvent[] = [];
    for (const [evKey, evRaw] of asPairs(iv(map, "@events")) ?? []) {
      const ev = asObj(evRaw);
      if (!ev) continue;
      events.push({
        id: numValue(evKey),
        name: strValue(iv(ev, "@name")),
        x: numValue(iv(ev, "@x")),
        y: numValue(iv(ev, "@y")),
        pages: parsePages(iv(ev, "@pages")),
      });
    }
    const mapData = decodeTable(iv(map, "@data")) ?? [];
    const layerSize = mapData.length > 0 ? mapData.length / 3 : 0;
    maps.push({
      id,
      name: strValue(info ? iv(info, "@name") : undefined),
      width: numValue(iv(map, "@width")),
      height: numValue(iv(map, "@height")),
      tilesetId: numValue(iv(map, "@tileset_id")),
      data: mapData.slice(0, layerSize), // 三层中的地面层（其余层与软锁检查无关）
      parallaxName: strValue(iv(map, "@parallax_name")),
      bgmName: (() => {
        const bgm = asObj(iv(map, "@autoplay_bgm") ? iv(map, "@bgm") : undefined);
        return bgm ? strValue(iv(bgm, "@name")) : "";
      })(),
      bgsName: "",
      battleback1Name: "",
      battleback2Name: "",
      encounterTroopIds: (asArray(iv(map, "@encounter_list")) ?? [])
        .map((e) => numValue(asObj(e) ? iv(asObj(e)!, "@troop_id") : undefined))
        .filter((n) => n > 0),
      events,
    });
  }

  const list = <T>(names: string[], map: (obj: Obj) => T): T[] => {
    for (const name of names) {
      const raw = parsed[name];
      if (raw === undefined) continue;
      const out: T[] = [];
      for (const entry of asArray(raw) ?? []) {
        const obj = asObj(entry);
        if (obj) out.push(map(obj));
      }
      return out;
    }
    return [];
  };

  const itemOf = (obj: Obj): IRItem => ({ id: numValue(iv(obj, "@id")), name: strValue(iv(obj, "@name")), iconIndex: numValue(iv(obj, "@icon_index")) });
  const enemyOf = (o: Obj): IREnemy => ({ id: numValue(iv(o, "@id")), name: strValue(iv(o, "@name")), battlerName: strValue(iv(o, "@battler_name")) });
  const animationOf = (o: Obj): IRAnimation => ({ id: numValue(iv(o, "@id")), name: strValue(iv(o, "@name")), image1Name: strValue(iv(o, "@animation1_name")), image2Name: strValue(iv(o, "@animation2_name")) });
  const classOf = (o: Obj): IRClass => ({ id: numValue(iv(o, "@id")), name: strValue(iv(o, "@name")) });
  const skillOf = (o: Obj): IRSkill => ({ id: numValue(iv(o, "@id")), name: strValue(iv(o, "@name")), iconIndex: numValue(iv(o, "@icon_index")) });
  const dataNames = (stem: string) => [`${stem}.rvdata2`, `${stem}.rvdata`];

  const actors: IRActor[] = [];
  for (const raw of asArray(parsed["Actors.rvdata2"] ?? parsed["Actors.rvdata"]) ?? []) {
    const a = asObj(raw);
    if (!a) continue;
    actors.push({
      id: numValue(iv(a, "@id")),
      name: strValue(iv(a, "@name")),
      classId: numValue(iv(a, "@class_id")),
      faceName: strValue(iv(a, "@face_name")),
      faceIndex: numValue(iv(a, "@face_index")),
      characterName: strValue(iv(a, "@character_name")),
      characterIndex: numValue(iv(a, "@character_index")),
    });
  }

  const commonEvents: IRCommonEvent[] = [];
  for (const raw of asArray(parsed["CommonEvents.rvdata2"] ?? parsed["CommonEvents.rvdata"]) ?? []) {
    const ce = asObj(raw);
    if (!ce) continue;
    commonEvents.push({
      id: numValue(iv(ce, "@id")),
      name: strValue(iv(ce, "@name")),
      trigger: numValue(iv(ce, "@trigger")),
      switchId: numValue(iv(ce, "@switch_id")) || null,
      commands: parseCommands(iv(ce, "@list")),
    });
  }

  const tilesets: IRTileset[] = [];
  for (const raw of asArray(parsed["Tilesets.rvdata2"] ?? parsed["Tilesets.rvdata"]) ?? []) {
    const t = asObj(raw);
    if (!t) continue;
    tilesets.push({
      id: numValue(iv(t, "@id")),
      name: strValue(iv(t, "@name")),
      imageNames: (asArray(iv(t, "@tileset_names")) ?? []).map((n) => strValue(n)),
      flags: decodeTable(iv(t, "@flags")) ?? [],
    });
  }

  const troops = (names: string[]): IRTroop[] => {
    const out: IRTroop[] = [];
    for (const raw of asArray(names.map((n) => parsed[n]).find((v) => v !== undefined)) ?? []) {
      const t = asObj(raw);
      if (!t) continue;
      out.push({
        id: numValue(iv(t, "@id")),
        name: strValue(iv(t, "@name")),
        enemyIds: (asArray(iv(t, "@members")) ?? [])
          .map((m) => numValue(asObj(m) ? iv(asObj(m)!, "@enemy_id") : undefined))
          .filter((n) => n > 0),
      });
    }
    return out;
  };

  return {
    ir: {
      schemaVersion: IR_SCHEMA_VERSION,
      engine: "rgss",
      system: sys,
      maps,
      actors,
      commonEvents,
      tilesets,
      items: list(dataNames("Items"), itemOf),
      weapons: list(dataNames("Weapons"), itemOf),
      armors: list(dataNames("Armors"), itemOf),
      skills: list(dataNames("Skills"), skillOf),
      troops: troops(dataNames("Troops")),
      enemies: list(dataNames("Enemies"), enemyOf),
      animations: list(dataNames("Animations"), animationOf),
      classes: list(dataNames("Classes"), classOf),
    },
    warnings,
  };
}

export { Cmd, at, atInt, asObj, asArray, asPairs, iv, numValue, strValue };
