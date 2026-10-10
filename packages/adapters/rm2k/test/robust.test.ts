/**
 * 健壮性测试 —— 损坏/截断输入不得崩溃，必须优雅降级。
 */
import { describe, expect, it } from "vitest";
import { parseLdb, parseLmt, parseLmu } from "../src/parse.ts";

describe("LCF 损坏输入", () => {
  it("空文件与短文件", () => {
    expect(parseLmt(new Uint8Array(0)).maps).toEqual([]);
    expect(parseLmt(new Uint8Array([5])).maps).toEqual([]);
    expect(parseLdb(new Uint8Array(0)).switches).toEqual([]);
    expect(parseLmu(new Uint8Array(0)).events).toEqual([]);
  });

  it("头声明长度超过文件 → 不崩溃", () => {
    const bytes = new Uint8Array([0x7f, 0x41]); // BER 长度 65，实际 1 字节
    expect(() => parseLmt(bytes)).not.toThrow();
  });

  it("结构块声明长度超过文件（截断）→ 不崩溃", () => {
    // header("LcfMapUnit" 截断为 "L") + 块头 0x01 长度 100 但无载荷
    const bytes = new Uint8Array([1, 0x4c, 0x01, 0x64]);
    expect(() => parseLmu(bytes)).not.toThrow();
  });

  it("BER 溢出（>5 组）→ 返回 0 不崩溃", () => {
    // 恰好 5 个 0x80 续位，无终止 → readInt 返回 0；文件结束 → 空结果
    const bytes = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80]);
    const r = parseLmt(bytes);
    expect(r.maps).toEqual([]);
  });

  it("事件命令截断（参数数大于可用字节）→ 不崩溃", () => {
    // 头 + Map 块 + events 块：命令 code=10810 后参数计数 999 但文件截断
    const chunks: number[] = [];
    const map = [0x01, 0x01, 0x02, 0x02, 0x05, 0x03, 0x05]; // chipset/width/height
    chunks.push(0x51);
    const ev = [0x01, 0x01, 0x45, 0x02, 0x02, 0x01, 0x03, 0x03, 0x01];
    const page = [0x21, 0x01, 0x00, 0x34];
    // commands 载荷：code BER 10810、indent 0、string 0、参数计数 999 后只给 1 字节
    const cmdPayload = [0xe7, 0x02, 0x6e, 0x00, 0x00, 0x87, 0x67, 0x00, 0x00, 0x00, 0x00, 0x42];
    const lmu = new Uint8Array([
      11, ..."LcfMapUnit".split("").map((c) => c.charCodeAt(0)),
      ...map,
      ...ev,
      ...page,
      ...cmdPayload,
    ]);
    expect(() => parseLmu(lmu)).not.toThrow();
  });

  it("乱码字节全量遍历不崩溃（512 字节伪随机）", () => {
    let seed = 0x12345678;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const bytes = new Uint8Array(512);
    for (let i = 0; i < bytes.length; i++) bytes[i] = rand() & 0xff;
    expect(() => parseLmt(bytes)).not.toThrow();
    expect(() => parseLdb(bytes)).not.toThrow();
    expect(() => parseLmu(bytes)).not.toThrow();
  });
});
