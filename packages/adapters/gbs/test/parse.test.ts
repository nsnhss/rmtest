import { describe, expect, it } from "vitest";
import { decompressCollisions, parseProject } from "../src/parse.ts";

describe("碰撞串解压", () => {
  it("单次与连续计数", () => {
    // 6×0 + 1 + 5×0
    expect(decompressCollisions("006+01!005+")).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
    // 全 0（0x0b = 11 个）
    expect(decompressCollisions("000b+")).toEqual(new Array(11).fill(0));
  });

  it("数组直通与非法串", () => {
    expect(decompressCollisions([0, 1, 2])).toEqual([0, 1, 2]);
    expect(decompressCollisions("zz")).toEqual([]);
    expect(decompressCollisions("00")).toEqual([]); // 缺计数标记
    expect(decompressCollisions(undefined)).toEqual([]);
  });
});

const LEGACY = {
  _version: "4.2.0",
  name: "legacy-demo",
  settings: { startSceneId: "scene-1", startX: 1, startY: 1, playerPaletteId: "pal-1" },
  scenes: [
    {
      id: "scene-1",
      name: "第一幕",
      type: "TOPDOWN",
      width: 4,
      height: 3,
      backgroundId: "bg-1",
      tilesetId: "",
      paletteIds: ["pal-1"],
      spritePaletteIds: [],
      collisions: "006+01!005+",
      actors: [
        {
          id: "actor-1",
          name: "村长",
          x: 2,
          y: 1,
          spriteSheetId: "sprite-1",
          paletteId: "",
          script: [{ command: "EVENT_ACTOR_SET_SPRITE", args: { actorId: "$self$", spriteSheetId: "sprite-2" } }],
          startScript: [{ command: "EVENT_GOTO_LABEL", args: { label: "walk" } }],
        },
      ],
      triggers: [
        { id: "trig-1", name: "门", x: 3, y: 0, width: 1, height: 1, script: [], leaveScript: [] },
      ],
      script: [
        {
          command: "EVENT_SWITCH_SCENE",
          args: { sceneId: "scene-2", x: { type: "number", value: 0 }, y: { type: "number", value: 0 } },
        },
      ],
      playerHit1Script: [{ command: "EVENT_MUSIC_PLAY", args: { musicId: "music-1" } }],
    },
    { id: "scene-2", name: "第二幕", type: "TOPDOWN", width: 3, height: 3, backgroundId: "bg-1", tilesetId: "", paletteIds: [], spritePaletteIds: [], collisions: "009+", actors: [], triggers: [], script: [] },
  ],
  customEvents: [{ id: "ce-1", name: "过场", script: [{ command: "EVENT_CALL_CUSTOM_EVENT", args: { customEventId: "ce-2" } }] }],
  spriteSheets: [
    { id: "sprite-1", name: "player", filename: "assets/sprites/player.png" },
    { id: "sprite-2", name: "npc", filename: "assets/sprites/npc.png" },
  ],
  backgrounds: [{ id: "bg-1", name: "bg", filename: "assets/backgrounds/bg.png" }],
  tilesets: [],
  sounds: [{ id: "sound-1", name: "se", filename: "assets/sounds/se.wav" }],
  music: [{ id: "music-1", name: "bgm", filename: "assets/music/bgm.mod" }],
  emotes: [],
  avatars: [],
  fonts: [],
  palettes: [{ id: "pal-1", name: "默认" }],
};

describe("旧版格式（≤4.2）解析", () => {
  const { section, warnings } = parseProject(LEGACY);

  it("设置与场景结构", () => {
    expect(warnings).toEqual([]);
    expect(section.startSceneId).toBe("scene-1");
    expect(section.startX).toBe(1);
    expect(section.scenes).toHaveLength(2);
    const s = section.scenes[0]!;
    expect(s.type).toBe("TOPDOWN");
    expect(s.width).toBe(4);
    expect(s.collisions).toHaveLength(12);
    expect(s.collisions[6]).toBe(1);
    expect(s.backgroundId).toBe("bg-1");
    expect(s.paletteIds).toEqual(["pal-1"]);
  });

  it("演员/触发器/脚本集合归一化", () => {
    const s = section.scenes[0]!;
    expect(s.actors[0]!.id).toBe("actor-1");
    expect(s.actors[0]!.prefabId).toBeNull();
    expect(s.actors[0]!.scripts.map((x) => x.key)).toEqual(["script", "startScript"]);
    expect(s.triggers[0]!.scripts).toEqual([]);
    expect(s.scripts.map((x) => x.key)).toEqual(["script", "playerHit1Script"]);
    const sw = s.scripts[0]!.events[0]!;
    expect(sw.command).toBe("EVENT_SWITCH_SCENE");
    expect(sw.args["sceneId"]).toBe("scene-2");
    expect(sw.args["x"]).toEqual({ type: "number", value: 0 });
  });

  it("资源 id 清单（旧版 spriteSheets 键）", () => {
    expect(section.spriteIds).toEqual(["sprite-1", "sprite-2"]);
    expect(section.backgroundIds).toEqual(["bg-1"]);
    expect(section.musicIds).toEqual(["music-1"]);
    expect(section.soundIds).toEqual(["sound-1"]);
    expect(section.paletteIds).toEqual(["pal-1"]);
    expect(section.customEvents).toHaveLength(1);
    expect(section.assetFiles.map((a) => a.filename)).toEqual([
      "assets/backgrounds/bg.png",
      "assets/sprites/player.png",
      "assets/sprites/npc.png",
      "assets/sounds/se.wav",
      "assets/music/bgm.mod",
    ]);
  });
});

const MODERN = {
  metadata: { _resourceType: "project", name: "modern-demo", _version: "4.3.0" },
  settings: { _resourceType: "settings", startSceneId: "scene-1", startX: 0, startY: 0 },
  scenes: [
    {
      _resourceType: "scene",
      id: "scene-1",
      name: "现代场景",
      type: "PLATFORM",
      width: 4,
      height: 3,
      backgroundId: "bg-1",
      tilesetId: "",
      paletteIds: [],
      spritePaletteIds: [],
      playerSpriteSheetId: "sprite-1",
      collisions: "00c+",
      actors: [{ _resourceType: "actor", id: "a1", name: "A", prefabId: "prefab-1", x: 0, y: 0, spriteSheetId: "", paletteId: "", script: [] }],
      triggers: [],
      script: [],
    },
  ],
  actorPrefabs: [{ _resourceType: "actorPrefab", id: "prefab-1", name: "P" }],
  triggerPrefabs: [],
  scripts: [],
  sprites: [{ _resourceType: "sprite", id: "sprite-1", name: "player", filename: "assets/sprites/player.png" }],
  backgrounds: [{ _resourceType: "background", id: "bg-1", name: "bg", filename: "assets/backgrounds/bg.png" }],
  tilesets: [],
  sounds: [],
  music: [],
  emotes: [],
  avatars: [],
  fonts: [],
  palettes: [],
};

describe("现代格式（4.3+）解析", () => {
  const { section } = parseProject(MODERN);

  it("资源段与预制件", () => {
    expect(section.customEvents).toEqual([]);
    expect(section.actorPrefabIds).toEqual(["prefab-1"]);
    expect(section.spriteIds).toEqual(["sprite-1"]);
    expect(section.scenes[0]!.actors[0]!.prefabId).toBe("prefab-1");
    expect(section.scenes[0]!.playerSpriteSheetId).toBe("sprite-1");
  });
});
