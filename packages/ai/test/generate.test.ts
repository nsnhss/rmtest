import { describe, expect, it } from "vitest";
import { IR_SCHEMA_VERSION, universeFromIR, type IRDocument } from "@rmtest/core";
import { MockProvider } from "../src/provider.ts";
import { buildGameSurface } from "../src/surface.ts";
import { generateScenario } from "../src/generate.ts";

function ir(): IRDocument {
  return {
    schemaVersion: IR_SCHEMA_VERSION,
    engine: "mv",
    system: {
      title: "T",
      switches: ["", "任务开关"],
      variables: ["", "计数"],
      startMapId: 1,
      startX: 2,
      startY: 2,
      title1Name: "",
      title2Name: "",
      sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
      vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
    },
    maps: [
      { id: 1, name: "起始镇", width: 5, height: 4, tilesetId: 1, data: [], parallaxName: "", bgmName: "", bgsName: "", battleback1Name: "", battleback2Name: "", encounterTroopIds: [], events: [] },
      { id: 2, name: "野外", width: 5, height: 4, tilesetId: 1, data: [], parallaxName: "", bgmName: "", bgsName: "", battleback1Name: "", battleback2Name: "", encounterTroopIds: [], events: [] },
    ],
    actors: [],
    commonEvents: [],
    tilesets: [],
    items: [],
    weapons: [],
    armors: [],
    skills: [],
    troops: [],
    enemies: [],
    animations: [],
    classes: [],
  };
}

const VALID_SCENARIO = JSON.stringify({
  id: "走两步",
  steps: [
    { type: "start_new_game" },
    { type: "walk", to: { map: 2, x: 1, y: 1 } },
    { type: "assert_map", map: 2 },
  ],
});

const doc = ir();
const universe = universeFromIR(doc);
const surface = buildGameSurface(doc);

describe("NL → DSL 生成（校验闸门循环）", () => {
  it("首次合法输出 → 一次通过", async () => {
    const result = await generateScenario("测试走到地图2", surface, doc, universe, new MockProvider([VALID_SCENARIO]));
    expect(result.error).toBeNull();
    expect(result.attempts).toBe(1);
    expect(result.scenario!.steps).toHaveLength(3);
    expect(result.feedback).toEqual([]);
  });

  it("代码围栏包裹的 JSON 也能提取", async () => {
    const fenced = "```json\n" + VALID_SCENARIO + "\n```";
    const result = await generateScenario("测试", surface, doc, universe, new MockProvider([fenced]));
    expect(result.error).toBeNull();
    expect(result.scenario!.id).toBe("走两步");
  });

  it("非法 JSON → 打回 → 第二次给出合法 → 成功且记录反馈", async () => {
    const provider = new MockProvider(["这不是JSON", VALID_SCENARIO]);
    const result = await generateScenario("测试", surface, doc, universe, provider);
    expect(result.error).toBeNull();
    expect(result.attempts).toBe(2);
    expect(result.feedback[0]).toContain("不是 JSON");
  });

  it("引用不存在的开关 → 打回 → 修正 → 成功", async () => {
    const bad = JSON.stringify({
      id: "x",
      steps: [
        { type: "start_new_game" },
        { type: "assert_switch", switchId: 99, value: true },
      ],
    });
    const provider = new MockProvider([bad, VALID_SCENARIO]);
    const result = await generateScenario("测试", surface, doc, universe, provider);
    expect(result.error).toBeNull();
    expect(result.attempts).toBe(2);
    expect(result.feedback[0]).toContain("开关 99");
  });

  it("重试耗尽 → 返回错误而非崩溃", async () => {
    const provider = new MockProvider(["垃圾", "垃圾", "垃圾"]);
    const result = await generateScenario("测试", surface, doc, universe, provider, { maxAttempts: 3 });
    expect(result.scenario).toBeNull();
    expect(result.attempts).toBe(3);
    expect(result.error).toContain("不是 JSON");
  });
});

describe("游戏表面", () => {
  it("开关/变量过滤 0 号槽", () => {
    expect(surface.switches).toEqual([{ id: 1, name: "任务开关" }]);
    expect(surface.variables).toEqual([{ id: 1, name: "计数" }]);
    expect(surface.maps.map((m) => m.id)).toEqual([1, 2]);
  });

  it("超长列表截断并注明", () => {
    const big = ir();
    for (let i = 0; i < 400; i++) {
      big.items.push({ id: i + 1, name: `道具${i}`, iconIndex: 0 });
    }
    const s = buildGameSurface(big);
    expect(s.items).toHaveLength(300);
    expect(s.truncated.some((t) => t.includes("道具"))).toBe(true);
  });
});
