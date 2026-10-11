import { describe, expect, it } from "vitest";
import { parseMarshal } from "../src/marshal.ts";
import { encodeMarshal, encodeTablePayload } from "./marshal-helpers.ts";

const sym = (s: string) => ({ $sym: s });
const obj = (cls: string, ivars: Record<string, unknown>) => ({ $obj: { cls, ivars } });
const hash = (pairs: Array<[unknown, unknown]>) => ({ $hash: pairs });
const utable = (payload: number[]) => ({ $utable: { cls: "Table", payload } });

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

  it("'u' 编码的 Table 解码为 $bytes（真实 RGSS _dump 格式）", () => {
    const data = [1, 2, 3, -4, 5, 6];
    const payload = encodeTablePayload(data, 1, data.length, 1, 1);
    const v = parseMarshal(encodeMarshal(utable(payload))) as { $user: string; $bytes: Uint8Array };

    expect(v.$user).toBe("Table");
    // 20 字节头 + count*2 字节 int16 数据
    expect(v.$bytes.length).toBe(20 + data.length * 2);

    const i32 = (o: number) =>
      (v.$bytes[o]! | (v.$bytes[o + 1]! << 8) | (v.$bytes[o + 2]! << 16) | (v.$bytes[o + 3]! << 24)) | 0;
    expect(i32(0)).toBe(1); // dims
    expect(i32(4)).toBe(data.length); // xsize
    expect(i32(8)).toBe(1); // ysize
    expect(i32(12)).toBe(1); // zsize
    expect(i32(16)).toBe(data.length); // count

    const i16 = (o: number) => {
      const u = v.$bytes[o]! | (v.$bytes[o + 1]! << 8);
      return u >= 0x8000 ? u - 0x10000 : u;
    };
    expect(data.map((_, i) => i16(20 + i * 2))).toEqual(data);
  });

  it("'u' 声明长度超出剩余缓冲 → 按剩余字节夹取，不越界", () => {
    const cls = "Table";
    const payload = encodeTablePayload([7, 8]); // 20 字节头(count=2) + 4 字节数据
    const stream = new Uint8Array([
      0x04,
      0x08,
      0x75,
      0x3a,
      0x0a,
      ...new TextEncoder().encode(cls),
      0x02,
      0xdc,
      0x05, // long(1500) —— 远大于真实载荷
      ...payload,
    ]);
    const v = parseMarshal(stream) as { $user: string; $bytes: Uint8Array };
    expect(v.$user).toBe("Table");
    expect(v.$bytes.length).toBe(payload.length);
  });

  it("'u' 载荷内 count 为负 → 数据偏移夹取为 0，不回退读取位置", () => {
    const i32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    const payload = [...i32(1), ...i32(0), ...i32(0), ...i32(0), ...i32(-1)];
    const v = parseMarshal(encodeMarshal(utable(payload))) as { $user: string; $bytes: Uint8Array };
    expect(v.$user).toBe("Table");
    expect(v.$bytes.length).toBe(20);
  });

  it("'u' 非 Table 类（Color / Tone）按不透明字节透传，不整文件失败", () => {
    const payload = [0, 0, 128, 63, 0, 0, 0, 0]; // 8 字节
    const stream = new Uint8Array([
      0x04,
      0x08,
      0x75,
      0x3a,
      0x0a, // 符号 "Color"（长度 5）
      ...new TextEncoder().encode("Color"),
      0x0d, // long(8)
      ...payload,
    ]);
    const v = parseMarshal(stream) as { $user: string; $bytes: Uint8Array };
    expect(v.$user).toBe("Color");
    expect(Array.from(v.$bytes)).toEqual(payload);
  });

  it("'U'（marshal_dump）旧路径仍可解码 Table", () => {
    const bytes = encodeMarshal({
      $user: { cls: "Table", bytes: encodeTablePayload([7, 8]) },
    });
    const v = parseMarshal(bytes) as { $user: string; $bytes: Uint8Array };
    expect(v.$user).toBe("Table");
    expect(v.$bytes.length).toBe(24);
  });

  it("对象类槽位为 nil → 抛描述性 Error 而非裸 TypeError", () => {
    let caught: unknown;
    try {
      parseMarshal(new Uint8Array([0x04, 0x08, 0x6f, 0x30]));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(TypeError);
    expect((caught as Error).message).toMatch(/Marshal/);
  });

  it("Marshal long 多字节补码解码（真实 RGSS 编码）", () => {
    const fixnum = (...tail: number[]) => parseMarshal(new Uint8Array([0x04, 0x08, 0x69, ...tail]));
    expect(fixnum(0xf1)).toBe(-10); // 短负数
    expect(fixnum(0xff, 0x38)).toBe(-200); // 1 字节补码
    expect(fixnum(0xfc, 0x00, 0x00, 0x00, 0x80)).toBe(-2147483648); // 4 字节补码
    expect(fixnum(0x02, 0xc4, 0x04)).toBe(1220); // 多字节小端正数（真实 Table 长度）
  });

  it("'@' 对象链接：重复引用解析为同一实例", () => {
    const shared = { $obj: { cls: "RPG::Thing", ivars: { "@v": 7 } } };
    const arr = parseMarshal(encodeMarshal([shared, { $link: 1 }, { $link: 1 }])) as unknown[];
    const first = arr[1] as { $class: string; $ivars: Map<string, unknown> };
    expect(first.$class).toBe("RPG::Thing");
    expect(first.$ivars.get("@v")).toBe(7);
    expect(arr[2]).toBe(arr[1]); // 同一实例（身份共享）
  });

  it("'@' 自引用数组与共享哈希对象可解析", () => {
    // 顶层数组先登记为索引 0 → [self, self] 形成环
    const cyclic = parseMarshal(encodeMarshal([{ $link: 0 }, { $link: 0 }])) as unknown[];
    expect(cyclic[0]).toBe(cyclic);
    expect(cyclic[1]).toBe(cyclic);

    // 哈希索引 0、对象索引 1 → 两个键共享同一对象
    const shared = { $obj: { cls: "RPG::Data", ivars: { "@n": 1 } } };
    const h = parseMarshal(
      encodeMarshal({ $hash: [[sym("a"), shared], [sym("b"), { $link: 1 }]] }),
    ) as { $pairs: Array<[unknown, unknown]> };
    expect(h.$pairs[0]![1]).toBe(h.$pairs[1]![1]);
  });

  it("超深嵌套 → 描述性错误而非栈溢出", () => {
    const bytes: number[] = [0x04, 0x08];
    for (let i = 0; i < 5000; i++) bytes.push(0x5b, 0x06); // '[' + long(1)：单元素数组
    bytes.push(0x30); // nil 收尾
    let caught: unknown;
    try {
      parseMarshal(new Uint8Array(bytes));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/嵌套层级/);
  });
});
