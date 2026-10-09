import { describe, expect, it } from "vitest";
import { parseConfig, parseScenario } from "../src/parse.ts";

const SCENE = [
  "*start",
  "[bg storage=\"room.png\"]",
  "こんにちは。",
  "[chara_new name=\"yukino\" storage=\"yukino.png\" jname=\"雪乃\"]",
  "選択肢：",
  "[link target=*good storage=end.ks]優しい[endlink]",
  "[jump target=*bad]",
  "*bad",
  "[playbgm storage=\"dark.ogg\"]",
  "[if exp=\"f.flag\"]",
  "[jump target=*start]",
  "[endif]",
  "[jump target=*start]",
  "*missing_endif",
  "[if exp=\"f.x\"]",
  "落ちる。",
  "*end",
  "[playvoice storage=&v.voice]",
  "[jump target=*nowhere storage=none.ks]",
  "[end]",
].join("\n");

describe("TyranoScript 场景解析", () => {
  it("标签/跳转/资产/条件解析", () => {
    const s = parseScenario("main.ks", SCENE);
    expect(s.file).toBe("main.ks");
    expect(s.labels.map((l) => l.name)).toEqual(["start", "bad", "missing_endif", "end"]);

    const start = s.labels[0]!;
    expect(start.jumps).toEqual([
      { kind: "link", target: "good", storage: "end.ks", precededByCondition: false, line: 6 },
      { kind: "jump", target: "bad", storage: null, precededByCondition: false, line: 7 },
    ]);
    expect(start.assets).toEqual([
      { kind: "bg", storage: "room.png", line: 2 },
      { kind: "fg", storage: "yukino.png", line: 4 },
    ]);

    const bad = s.labels[1]!;
    // 条件跳回 start（合法）+ 无条件跳回 start（死循环）
    expect(bad.jumps).toEqual([
      { kind: "jump", target: "start", storage: null, precededByCondition: true, line: 11 },
      { kind: "jump", target: "start", storage: null, precededByCondition: true, line: 13 },
    ]);
    expect(bad.assets).toEqual([{ kind: "bgm", storage: "dark.ogg", line: 9 }]);

    // 动态资产 → null 跳过
    expect(s.labels[3]!.assets).toEqual([{ kind: "voice", storage: null, line: 18 }]);
    expect(s.labels[3]!.jumps).toEqual([{ kind: "jump", target: "nowhere", storage: "none.ks", precededByCondition: false, line: 19 }]);
  });

  it("未闭合 if → 语法错误", () => {
    const s = parseScenario("main.ks", SCENE);
    expect(s.syntaxErrors).toContainEqual({ line: 20, message: "1 个块（if/macro）未闭合" });
  });

  it("endif 无匹配 if → 语法错误", () => {
    const s = parseScenario("x.ks", "*a\n[endif]\n");
    expect(s.syntaxErrors).toEqual([{ line: 2, message: "endif 没有匹配的 if" }]);
  });

  it("注释与行内 ; 截断", () => {
    const s = parseScenario("x.ks", "; 全行注释\n*start\n[bg storage=\"a.png\"] ; 行尾注释\n");
    expect(s.labels).toHaveLength(1);
    expect(s.labels[0]!.assets).toEqual([{ kind: "bg", storage: "a.png", line: 3 }]);
  });
});

describe("Config.tjs 解析", () => {
  it("默认入口 first.ks/*start", () => {
    expect(parseConfig(null)).toEqual({ firstScenario: "first.ks", firstLabel: "*start", title: "" });
  });

  it("自定义入口与标题", () => {
    const cfg = 'firstScenario = "prologue.ks";\nfirstLabel = "*begin";\ntitle = "テスト";\n';
    expect(parseConfig(cfg)).toEqual({ firstScenario: "prologue.ks", firstLabel: "*begin", title: "テスト" });
  });
});
