/**
 * GB Studio 工程（.gbsproj）解析 —— 现代资源格式（v4.3+，_resourceType 标记）与
 * 旧版格式（≤4.2，顶层数组 + 内联 actors/triggers）归一化为同一 IR 段。
 * 依据：chrismaltby/gb-studio develop 分支 src/shared/lib/resources/types.ts 与
 * src/lib/project/migration/legacy/migrateLegacyProject.ts。
 */
import type {
  IRGBSActor,
  IRGBSScene,
  IRGBSScriptEvent,
  IRGBSScriptSet,
  IRGBSSection,
  IRGBSTrigger,
} from "@rmtest/core";

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown, def = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

/** 碰撞串解压（GB Studio compress8bitNumberString 的逆运算：2 位 16 进制值 + "!" 单次 或 16 进制计数 "+"） */
export function decompressCollisions(raw: unknown): number[] {
  if (Array.isArray(raw)) return (raw as unknown[]).map((n) => num(n));
  if (typeof raw !== "string" || raw.length === 0) return [];
  const out: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const value = parseInt(raw.slice(i, i + 2), 16);
    i += 2;
    if (Number.isNaN(value)) return [];
    let count = 1;
    if (i < raw.length) {
      if (raw[i] === "!") {
        count = 1;
        i++;
      } else {
        const end = raw.indexOf("+", i);
        if (end === -1) return [];
        count = parseInt(raw.slice(i, end), 16);
        if (Number.isNaN(count)) return [];
        i = end + 1;
      }
    } else {
      return [];
    }
    for (let j = 0; j < count; j++) out.push(value);
  }
  return out;
}

function normalizeEvents(v: unknown): IRGBSScriptEvent[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).map((e) => {
    const r = asRecord(e);
    return {
      id: typeof r["id"] === "string" ? (r["id"] as string) : undefined,
      command: str(r["command"]),
      args: asRecord(r["args"]),
      children: normalizeChildren(r["children"]),
    };
  });
}

function normalizeChildren(v: unknown): Record<string, IRGBSScriptEvent[] | undefined> | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const out: Record<string, IRGBSScriptEvent[] | undefined> = {};
  for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(child)) out[k] = normalizeEvents(child);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 脚本集合（scene: script/hit1-3；actor: script/start/update/hit1-3；trigger: script/leave） */
function scriptSets(raw: Record<string, unknown>, keys: string[]): IRGBSScriptSet[] {
  const out: IRGBSScriptSet[] = [];
  for (const key of keys) {
    const events = normalizeEvents(raw[key]);
    if (events.length > 0) out.push({ key, events });
  }
  return out;
}

const SCENE_SCRIPT_KEYS = ["script", "playerHit1Script", "playerHit2Script", "playerHit3Script"];
const ACTOR_SCRIPT_KEYS = ["script", "startScript", "updateScript", "hit1Script", "hit2Script", "hit3Script"];
const TRIGGER_SCRIPT_KEYS = ["script", "leaveScript"];

function normalizeActor(v: unknown): IRGBSActor {
  const a = asRecord(v);
  const prefabId = str(a["prefabId"]);
  return {
    id: str(a["id"]),
    name: str(a["name"]),
    prefabId: prefabId.length > 0 ? prefabId : null,
    x: num(a["x"]),
    y: num(a["y"]),
    spriteSheetId: str(a["spriteSheetId"]),
    paletteId: str(a["paletteId"]),
    scripts: scriptSets(a, ACTOR_SCRIPT_KEYS),
  };
}

function normalizeTrigger(v: unknown): IRGBSTrigger {
  const t = asRecord(v);
  const prefabId = str(t["prefabId"]);
  return {
    id: str(t["id"]),
    name: str(t["name"]),
    prefabId: prefabId.length > 0 ? prefabId : null,
    x: num(t["x"]),
    y: num(t["y"]),
    width: num(t["width"]),
    height: num(t["height"]),
    scripts: scriptSets(t, TRIGGER_SCRIPT_KEYS),
  };
}

function normalizeScene(v: unknown): IRGBSScene {
  const s = asRecord(v);
  const ps = str(s["playerSpriteSheetId"]);
  return {
    id: str(s["id"]),
    name: str(s["name"]),
    type: str(s["type"]).toUpperCase(),
    width: num(s["width"]),
    height: num(s["height"]),
    backgroundId: str(s["backgroundId"]),
    tilesetId: str(s["tilesetId"]),
    paletteIds: asArr(s["paletteIds"]).map(str),
    spritePaletteIds: asArr(s["spritePaletteIds"]).map(str),
    playerSpriteSheetId: ps.length > 0 ? ps : null,
    collisions: decompressCollisions(s["collisions"]),
    actors: asArr(s["actors"]).map(normalizeActor),
    triggers: asArr(s["triggers"]).map(normalizeTrigger),
    scripts: scriptSets(s, SCENE_SCRIPT_KEYS),
  };
}

function idsOf(list: unknown[]): string[] {
  return list.map((v) => str(asRecord(v)["id"])).filter((id) => id.length > 0);
}

export interface ParsedGBS {
  section: IRGBSSection;
  warnings: string[];
}

export function parseProject(json: unknown): ParsedGBS {
  const root = asRecord(json);
  const warnings: string[] = [];

  // 现代格式：任何顶层资源带 _resourceType；旧版：顶层 _version + 数组
  const modern = Object.values(root).some(
    (v) => typeof v === "object" && v !== null && "_resourceType" in (v as object),
  );

  const settings = asRecord(root["settings"]);
  const scenes = asArr(root["scenes"]);
  const customEvents = asArr(modern ? root["scripts"] : root["customEvents"]);
  const actorPrefabs = modern ? asArr(root["actorPrefabs"]) : [];
  const triggerPrefabs = modern ? asArr(root["triggerPrefabs"]) : [];

  const backgrounds = asArr(root["backgrounds"]);
  const sprites = asArr(root["spriteSheets"] ?? root["sprites"]);
  const tilesets = asArr(root["tilesets"]);
  const sounds = asArr(root["sounds"]);
  const music = asArr(root["music"]);
  const emotes = asArr(root["emotes"]);
  const avatars = asArr(root["avatars"]);
  const fonts = asArr(root["fonts"]);
  const palettes = asArr(root["palettes"]);

  if (scenes.length === 0) warnings.push("工程没有任何场景");
  const startSceneId = str(settings["startSceneId"]);
  if (startSceneId.length === 0) warnings.push("settings.startSceneId 缺失（游戏无法启动）");

  const assetLists = [
    ...backgrounds.map((v) => ["background", asRecord(v)] as const),
    ...sprites.map((v) => ["sprite", asRecord(v)] as const),
    ...tilesets.map((v) => ["tileset", asRecord(v)] as const),
    ...emotes.map((v) => ["emote", asRecord(v)] as const),
    ...avatars.map((v) => ["avatar", asRecord(v)] as const),
    ...fonts.map((v) => ["font", asRecord(v)] as const),
    ...sounds.map((v) => ["sound", asRecord(v)] as const),
    ...music.map((v) => ["music", asRecord(v)] as const),
  ];
  const assetFiles: IRGBSSection["assetFiles"] = [];
  for (const [kind, r] of assetLists) {
    const id = str(r["id"]);
    const filename = str(r["filename"]);
    if (id.length === 0 || filename.length === 0) continue;
    const plugin = str(r["plugin"]);
    const rel = plugin.length > 0 ? `plugins/${plugin}/${filename}` : filename;
    // 存在性在 loader 里核对；此处占位
    assetFiles.push({ id, filename: rel, exists: false, caseInsensitiveMatch: false });
  }

  return {
    section: {
      startSceneId,
      startX: num(settings["startX"]),
      startY: num(settings["startY"]),
      scenes: scenes.map(normalizeScene),
      customEvents: customEvents.map((v) => {
        const c = asRecord(v);
        return { id: str(c["id"]), name: str(c["name"]), script: normalizeEvents(c["script"]) };
      }),
      actorPrefabIds: idsOf(actorPrefabs),
      triggerPrefabIds: idsOf(triggerPrefabs),
      spriteIds: idsOf(sprites),
      backgroundIds: idsOf(backgrounds),
      tilesetIds: idsOf(tilesets),
      soundIds: idsOf(sounds),
      musicIds: idsOf(music),
      emoteIds: idsOf(emotes),
      avatarIds: idsOf(avatars),
      fontIds: idsOf(fonts),
      paletteIds: idsOf(palettes),
      assetFiles,
    },
    warnings,
  };
}
