import { describe, expect, it } from "vitest";
import { parseMarshal } from "../src/marshal.ts";
import { encodeMarshal } from "./marshal-helpers.ts";

const sym = (s: string) => ({ $sym: s });
const obj = (cls: string, ivars: Record<string, unknown>) => ({ $obj: { cls, ivars } });
const hash = (pairs: Array<[unknown, unknown]>) => ({ $hash: pairs });

describe("Ruby Marshal 解析器", () => {
  it("标量往返", () => {
    expect(parseMarshal(encodeMarshal(null))).toBeNull();
    expect(parseMarshal(encodeMarshal(true))).toBe(true);
    expect(parseMarshal(encodeMarshal(false))).toBe(false);
    expect(parseMarshal(encodeMarshal(0))).toBe(0);
    expect(parseMarshal(encodeMarshal(5))).toBe(5);
    expect(parseMarshal(encodeMarshal(200))).toBe(200);
    expect(parseMarshal(encodeMarshal(-10))).toBe(-10);
    expect(parseMarshal(encodeMarshal("你好"))).toBe("你好");
  });

  it("数组与哈希往返", () => {
    const arr = parseMarshal(encodeMarshal([1, "a", null])) as unknown[];
    expect(arr).toEqual([1, "a", null]);

    const h = parseMarshal(encodeMarshal(hash([[1, "one"], [2, "two"]]))) as { $pairs: Array<[number, string]> };
    expect(h.$pairs).toEqual([[1, "one"], [2, "two"]]);
  });

  it("对象与 ivars", () => {
    const o = parseMarshal(encodeMarshal(obj("RPG::Event", { "@id": 1, "@name": "EV" }))) as {
      $class: string;
      $ivars: Map<string, unknown>;
    };
    expect(o.$class).toBe("RPG::Event");
    expect(o.$ivars.get("@id")).toBe(1);
    expect(o.$ivars.get("@name")).toBe("EV");
  });

  it("符号", () => {
    const s = parseMarshal(encodeMarshal(sym("hello"))) as { $symbol: string };
    expect(s.$symbol).toBe("hello");
  });

  it("坏流 → 抛错不猜测", () => {
    expect(() => parseMarshal(new Uint8Array([0, 0, 0]))).toThrow(/版本头/);
    expect(() => parseMarshal(new Uint8Array([0x04, 0x08, 0x7e]))).toThrow(/标签/);
  });
});
