import { describe, expect, it } from "vitest";
import { IR_SCHEMA_VERSION, type IRDocument, type ReportSection } from "@rmtest/core";
import { renderReport } from "../src/render.ts";

function ir(): IRDocument {
  return {
    schemaVersion: IR_SCHEMA_VERSION,
    engine: "mv",
    system: {
      title: "测试游戏",
      switches: ["", "A"],
      variables: ["", "B"],
      startMapId: 1,
      startX: 1,
      startY: 1,
      title1Name: "",
      title2Name: "",
      sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
      vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
    },
    maps: [],
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

function render(sections: ReportSection[], extra?: Partial<Parameters<typeof renderReport>[0]>): string {
  return renderReport({
    ir: ir(),
    sections,
    fingerprint: "abc",
    loadWarnings: [],
    pluginErrors: [],
    generatedAt: new Date(0),
    ...extra,
  });
}

describe("HTML 报告渲染", () => {
  it("按严重度排序并计数", () => {
    const sections: ReportSection[] = [
      { type: "x", severity: "info", confidence: "low", message: "i" },
      { type: "x", severity: "error", confidence: "high", message: "e" },
      { type: "y", severity: "warning", confidence: "medium", message: "w" },
    ];
    const html = render(sections);
    expect(html.indexOf("error")).toBeLessThan(html.indexOf("warning"));
    expect(html.indexOf("warning")).toBeLessThan(html.indexOf("info"));
    expect(html).toContain("错误 1");
    expect(html).toContain("警告 1");
    expect(html).toContain("提示 1");
  });

  it("消息中的 HTML 被转义（XSS 防线）", () => {
    const html = render([{ type: "x", severity: "error", confidence: "high", message: `<script>alert(1)</script>` }]);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("位置格式化（地图/事件/页/命令）", () => {
    const html = render([
      { type: "x", severity: "error", confidence: "high", message: "m", location: { mapId: 3, eventId: 7, pageIndex: 1, commandIndex: 4 } },
    ]);
    expect(html).toContain("地图 3 · 事件 7 · 页 2 · 命令 4");
  });

  it("零报告显示成功占位", () => {
    expect(render([])).toContain("未发现问题");
  });

  it("插件错误与加载警告独立区块", () => {
    const html = render([], { pluginErrors: [{ plugin: "p", message: "x" }], loadWarnings: ["w"] });
    expect(html).toContain("插件错误（1）");
    expect(html).toContain("加载警告（1）");
  });
});
