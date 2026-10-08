/**
 * Ruby Marshal 解析器 —— RGSS（XP/VX/VX Ace）数据文件（.rxdata/.rvdata/.rvdata2）的解码。
 *
 * 覆盖 RGSS 数据需要的子集：
 * - 标量：nil / true / false / fixnum / 字符串 / 符号（含符号表引用）/ 浮点
 * - 容器：数组 / 哈希 / 对象（类名 + ivars）
 * - bignum 与 UserDefined 按原始字节透传（如 Table 类型，RGSS 适配器暂不解析）
 *
 * 格式依据 Ruby marshal.c 的公开格式文档；解析容错：未知标签抛错而非猜测。
 */
export type MarshalValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | { $symbol: string }
  | MarshalValue[]
  | { $pairs: Array<[MarshalValue, MarshalValue]> }
  | { $class: string; $ivars: Map<string, MarshalValue> }
  | { $user: string; $bytes: Uint8Array };

class Reader {
  #buf: Uint8Array;
  #pos = 0;
  #symbols: string[] = [];

  constructor(buf: Uint8Array) {
    this.#buf = buf;
  }

  readByte(): number {
    if (this.#pos >= this.#buf.length) throw new Error("Marshal 流意外结束");
    return this.#buf[this.#pos++]!;
  }

  readBytes(n: number): Uint8Array {
    const out = this.#buf.subarray(this.#pos, this.#pos + n);
    this.#pos += n;
    return out;
  }

  /** Marshal long（长度/计数编码：无标签的 fixnum 编码） */
  readLong(): number {
    const c = this.readByte();
    if (c === 0) return 0;
    if (c > 4 && c < 128) return c - 5;
    if (c > 128 && c < 252) return c - 256 + 5;
    const len = c === 1 ? 1 : c === 2 ? 2 : c === 3 ? 3 : 4;
    let v = 0;
    for (let i = 0; i < len; i++) v |= this.readByte() << (8 * i);
    if (c === 255) v = -v;
    return v;
  }

  readSymbol(): string {
    const len = this.readLong();
    const bytes = this.readBytes(len);
    return new TextDecoder().decode(bytes);
  }

  parseValue(): MarshalValue {
    const tag = this.readByte();
    switch (tag) {
      case 0x30: // '0'
        return null;
      case 0x54: // 'T'
        return true;
      case 0x46: // 'F'
        return false;
      case 0x69: // 'i' fixnum
        return this.parseFixnum();
      case 0x3a: {
        // ':' 新符号 → 入符号表
        const sym = this.readSymbol();
        this.#symbols.push(sym);
        return { $symbol: sym };
      }
      case 0x49: // 'I' 带 ivars 的字符串
        return this.parseTaggedString();
      case 0x22: // '"' 字符串
        return this.parseRawString();
      case 0x5b: // '[' 数组
        return this.parseArray();
      case 0x7b: // '{' 哈希
        return this.parseHash();
      case 0x6f: // 'o' 对象
        return this.parseObject();
      case 0x66: // 'f' 浮点
        return this.parseFloatValue();
      case 0x6c: // 'l' bignum → 透传为原始（数值很大时用 bigint）
        return this.parseBignum();
      case 0x55: // 'U' user-defined
        return this.parseUserDefined();
      case 0x3b: {
        // ';' 符号表引用
        const index = this.parseFixnum();
        const sym = this.#symbols[index];
        if (sym === undefined) throw new Error(`符号表索引 ${index} 越界`);
        return { $symbol: sym };
      }
      default:
        throw new Error(`不支持的 Marshal 标签 0x${tag.toString(16)}`);
    }
  }

  parseFixnum(): number {
    const c = this.readByte();
    if (c === 0) return 0;
    if (c > 4 && c < 128) return c - 5;
    if (c > 128 && c < 252) return c - 256 + 5;
    const len = c === 1 ? 1 : c === 2 ? 2 : c === 3 ? 3 : 4;
    let v = 0;
    for (let i = 0; i < len; i++) v |= this.readByte() << (8 * i);
    if (c === 255) v = -v;
    return v;
  }

  parseRawString(): string {
    const len = this.readLong();
    return new TextDecoder().decode(this.readBytes(len));
  }

  parseTaggedString(): string {
    // 'I' = 字符串 + 后缀 ivar 表（哈希）；值本身照常取
    const str = this.parseRawString();
    const pairs = this.readLong();
    for (let i = 0; i < pairs; i++) {
      this.parseValue(); // key（符号）
      this.parseValue(); // value
    }
    return str;
  }

  parseArray(): MarshalValue[] {
    const count = this.readLong();
    const out: MarshalValue[] = [];
    for (let i = 0; i < count; i++) out.push(this.parseValue());
    return out;
  }

  parseHash(): { $pairs: Array<[MarshalValue, MarshalValue]> } {
    const count = this.readLong();
    const pairs: Array<[MarshalValue, MarshalValue]> = [];
    for (let i = 0; i < count; i++) {
      const key = this.parseValue();
      const value = this.parseValue();
      pairs.push([key, value]);
    }
    return { $pairs: pairs };
  }

  parseObject(): { $class: string; $ivars: Map<string, MarshalValue> } {
    const cls = this.parseValue();
    const className = typeof cls === "string" || "$symbol" in (cls as object) ? symbolOf(cls) : "Object";
    const count = this.readLong();
    const ivars = new Map<string, MarshalValue>();
    for (let i = 0; i < count; i++) {
      const key = this.parseValue();
      const value = this.parseValue();
      ivars.set(symbolOf(key), value);
    }
    return { $class: className, $ivars: ivars };
  }

  parseFloatValue(): number {
    const len = this.readLong();
    const str = new TextDecoder().decode(this.readBytes(len));
    const v = Number(str);
    return Number.isFinite(v) ? v : 0;
  }

  parseBignum(): bigint {
    const sign = this.readByte() === 0x2d ? -1n : 1n;
    const words = this.readLong() * 2;
    let v = 0n;
    for (let i = 0; i < words; i++) v |= BigInt(this.readByte()) << BigInt(8 * i);
    return sign * v;
  }

  parseUserDefined(): { $user: string; $bytes: Uint8Array } {
    const cls = this.parseValue();
    const bytes = this.#buf.subarray(this.#pos); // 剩余全部（UserDefined 无法知道边界）
    this.#pos = this.#buf.length;
    return { $user: symbolOf(cls), $bytes: bytes };
  }
}

function symbolOf(v: MarshalValue): string {
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "$symbol" in (v as object)) return (v as { $symbol: string }).$symbol;
  return "";
}

export function parseMarshal(bytes: Uint8Array): MarshalValue {
  if (bytes[0] !== 0x04 || bytes[1] !== 0x08) throw new Error("不是 Ruby Marshal 流（版本头不符）");
  const reader = new Reader(bytes);
  reader.readBytes(2); // 版本头
  return reader.parseValue();
}

export function objValue(obj: { $class: string; $ivars: Map<string, MarshalValue> }, ivar: string): MarshalValue | undefined {
  return obj.$ivars.get(ivar);
}

export function numValue(v: MarshalValue | undefined): number {
  return typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : 0;
}

export function strValue(v: MarshalValue | undefined): string {
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "$symbol" in (v as object)) return (v as { $symbol: string }).$symbol;
  return "";
}
