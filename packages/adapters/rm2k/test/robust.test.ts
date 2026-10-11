/**
 * 健壮性测试 —— 损坏/截断输入不得崩溃，必须优雅降级。
 */
import { describe, expect, it } from "vitest";
import { parseLdb, parseLmt, parseLmu } from "../src/parse.ts";
import { writeInt } from "../src/lcf.ts";
import { Enc, withHeader } from "../src/enc.ts";

const body = (e: Enc): number[] => Array.from(e.out);

/**
 * 构造恰好 16 字节的 LMU：header 字符串 + 0x51（事件向量）块，
 * 向量计数被声明为 count（可达 0xFFFFFFFF）。header 内容仅占位
 * （解析器不校验 header 文本），长度用来把总长对齐到 16 字节。
 */
function lmuWithHugeEventCount(count: number): Uint8Array {
  const tag = "LcfMapUnit";
  const countBytes = writeInt(count);
  const headerLen = 16 - (1 + 1 + 1 + countBytes.length); // 长度字节 + 0x51 + 块长度字节 + 计数
  const header = [...tag.slice(0, headerLen)].map((c) => c.charCodeAt(0));
  return new Uint8Array([headerLen, ...header, 0x51, countBytes.length, ...countBytes]);
}

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

  it("事件命令截断（参数数远大于可用字节）→ 不崩溃且结果有界", () => {
    // commands 载荷：code 10810、indent 0、string ""、声明参数 999，随后仅 1 字节即截断
    const cmdPayload = [...writeInt(10810), ...writeInt(0), 0, ...writeInt(999), 0x42];
    const page = new Enc().intField(0x21, 0).chunk(0x34, cmdPayload);
    const ev = new Enc().strField(0x01, "EV1").structVecField(0x05, [{ id: 1, body: body(page) }]);
    const map = new Enc().intField(0x01, 7).structVecField(0x51, [{ id: 5, body: body(ev) }]);
    const lmu = withHeader("LcfMapUnit", map);

    const parsed = parseLmu(lmu);
    const commands = parsed.events.flatMap((e) => e.pages.flatMap((p) => p.commands));
    expect(commands).toHaveLength(1); // 确认真的走到了命令解析
    // 声明 999 个参数但载荷只剩 1 字节 → 参数数必须被钳制到输入规模内
    expect(commands[0]!.parameters.length).toBeLessThanOrEqual(lmu.length);
  });

  it("超大事件计数（16 字节 LMU 声明 200000 / 4000000000）→ 不崩溃且结果有界", () => {
    for (const count of [200000, 4000000000]) {
      const bytes = lmuWithHugeEventCount(count);
      expect(bytes).toHaveLength(16);
      const result = parseLmu(bytes);
      expect(result.events.length).toBeLessThanOrEqual(bytes.length);
    }
    // 顶层向量没有块长可用，走剩余字节预算：LMT 地图向量
    const lmt = new Uint8Array([
      ...writeInt(10),
      ..."LcfMapTree".split("").map((c) => c.charCodeAt(0)),
      ...writeInt(200000),
    ]);
    expect(parseLmt(lmt).maps.length).toBeLessThanOrEqual(lmt.length);
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
