import { afterEach, describe, expect, it } from "vitest";
import { catalogKeys, LOCALES, localizeMessage, lookup, msg, resolveLocale, t } from "../src/index.ts";

describe("语言解析", () => {
  const original = process.env["RMTEST_LANG"];
  afterEach(() => {
    if (original === undefined) delete process.env["RMTEST_LANG"];
    else process.env["RMTEST_LANG"] = original;
  });

  it("显式参数优先，支持 jp/kr/cn 等别名与区域标签", () => {
    expect(resolveLocale("ja")).toBe("ja");
    expect(resolveLocale("jp")).toBe("ja");
    expect(resolveLocale("kr")).toBe("ko");
    expect(resolveLocale("cn")).toBe("zh");
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("ja_JP.UTF-8")).toBe("ja");
  });

  it("环境变量次之，显式参数仍最优先", () => {
    process.env["RMTEST_LANG"] = "ko";
    expect(resolveLocale()).toBe("ko");
    expect(resolveLocale("ja")).toBe("ja");
  });

  it("无法识别时落到受支持语言之一", () => {
    delete process.env["RMTEST_LANG"];
    expect(LOCALES).toContain(resolveLocale("xx-YY"));
    expect(LOCALES).toContain(resolveLocale(null));
  });
});

describe("目录完整性", () => {
  it("四种语言键集完全一致且无空译", () => {
    const base = catalogKeys("zh");
    expect(base.length).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      expect(catalogKeys(locale), locale).toEqual(base);
      for (const key of base) {
        expect(catalogs(locale, key).length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});

function catalogs(locale: (typeof LOCALES)[number], key: string): string {
  const value = lookup(locale, key);
  if (value === undefined) throw new Error(`缺键 ${locale}:${key}`);
  return value;
}

describe("翻译", () => {
  it("查表命中目标语言；缺键回退中文；再无则返回键名", () => {
    expect(t("en", "report.severity.error")).toBe("Error");
    expect(t("ja", "report.severity.error")).toBe("エラー");
    expect(t("ko", "report.severity.error")).toBe("오류");
    expect(lookup("en", "不存在.的键")).toBeUndefined();
    expect(t("en", "不存在.的键")).toBe("不存在.的键");
  });

  it("占位符插值，缺参数保留原样", () => {
    expect(t("en", "report.count.error", { count: 3 })).toBe("Errors 3");
    expect(t("ja", "report.count.error", { count: 3 })).toBe("エラー 3");
    expect(t("en", "report.count.error")).toContain("{count}");
  });
});

describe("可本地化消息", () => {
  it("msg() 产出中文原文 + 键 + 参数", () => {
    const m = msg("report.results", { count: 2 });
    expect(m.message).toBe("检查结果（2）");
    expect(m.messageId).toBe("report.results");
    expect(m.messageParams).toEqual({ count: 2 });
  });

  it("localizeMessage 按语言渲染，缺键回退原文", () => {
    const m = msg("report.none");
    expect(localizeMessage(m, "zh")).toBe("未发现问题 🎉");
    expect(localizeMessage(m, "en")).toBe("No problems found 🎉");
    expect(localizeMessage(m, "ko")).toBe("문제를 찾지 못했습니다 🎉");
    expect(localizeMessage({ message: "原文" }, "en")).toBe("原文");
    expect(localizeMessage({ message: "原文", messageId: "缺.键" }, "en")).toBe("原文");
  });
});
