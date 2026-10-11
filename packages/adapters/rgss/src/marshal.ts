/**
 * Ruby Marshal 解析器 —— RGSS（XP/VX/VX Ace）数据文件（.rxdata/.rvdata/.rvdata2）的解码。
 *
 * 覆盖 RGSS 数据需要的子集：
 * - 标量：nil / true / false / fixnum / 字符串 / 符号（含符号表引用）/ 浮点
 * - 容器：数组 / 哈希 / 对象（类名 + ivars）
 * - bignum 按原始字节透传；UserDefined 支持 'U'（marshal_dump）与 'u'（_dump，Table 等）
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
  /** 对象表：可链接对象按首次出现顺序登记，'@' 链接按此索引取回同一实例 */
  #objects: MarshalValue[] = [];
  #depth = 0;

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

  /** Marshal long（长度/计数/整数值编码：有符号首字节 + 小端补码，与 ruby r_long 一致） */
  readLong(): number {
    const c = this.readByte();
    if (c === 0) return 0;
    const sc = c > 127 ? c - 256 : c; // 首字节按 signed char 解释
    if (sc > 4 && sc < 128) return sc - 5;
    if (sc > -129 && sc < -4) return sc + 5;
    const len = sc > 0 ? sc : -sc; // 1..4 字节小端
    let u = 0;
    for (let i = 0; i < len; i++) u += this.readByte() * 2 ** (8 * i);
    return sc < 0 ? u - 2 ** (8 * len) : u;
  }

  readSymbol(): string {
    const len = this.readLong();
    const bytes = this.readBytes(len);
    return new TextDecoder().decode(bytes);
  }

  /** 递归入口：限制嵌套深度，坏流深嵌套降级为描述性错误而非栈溢出 */
  parseValue(): MarshalValue {
    if (this.#depth >= 1000) throw new Error("Marshal 嵌套层级超过上限 1000");
    this.#depth++;
    try {
      return this.#readValue();
    } finally {
      this.#depth--;
    }
  }

  #readValue(): MarshalValue {
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
      case 0x55: // 'U' user-defined（marshal_dump）
        return this.parseUserDefined();
      case 0x75: // 'u' userdef（_dump，真实 RGSS 的 Table 走此路径）
        return this.parseUserDefinedBytes();
      case 0x40: {
        // '@' 对象链接：引用对象表中已登记的对象，返回同一实例
        const index = this.readLong();
        const linked = this.#objects[index];
        if (linked === undefined) throw new Error(`对象链接索引 ${index} 越界`);
        return linked;
      }
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
    return this.readLong();
  }

  parseRawString(): string {
    const len = this.readLong();
    const str = new TextDecoder().decode(this.readBytes(len));
    this.#objects.push(str); // String 可被 '@' 链接
    return str;
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
    this.#objects.push(out); // 先登记再读子元素，支持自引用
    for (let i = 0; i < count; i++) out.push(this.parseValue());
    return out;
  }

  parseHash(): { $pairs: Array<[MarshalValue, MarshalValue]> } {
    const count = this.readLong();
    const pairs: Array<[MarshalValue, MarshalValue]> = [];
    const out = { $pairs: pairs };
    this.#objects.push(out); // 先登记再读键值对，支持自引用
    for (let i = 0; i < count; i++) {
      const key = this.parseValue();
      const value = this.parseValue();
      pairs.push([key, value]);
    }
    return out;
  }

  parseObject(): { $class: string; $ivars: Map<string, MarshalValue> } {
    const cls = this.parseValue();
    // 类槽位可能为 nil / 非对象（坏流或紧凑写法）：显式判空，避免裸 TypeError
    const className =
      typeof cls === "string" || (cls !== null && typeof cls === "object" && "$symbol" in cls)
        ? symbolOf(cls)
        : "Object";
    const count = this.readLong();
    const ivars = new Map<string, MarshalValue>();
    const obj = { $class: className, $ivars: ivars };
    this.#objects.push(obj); // 先登记再读 ivars，支持对象自引用
    for (let i = 0; i < count; i++) {
      const key = this.parseValue();
      const value = this.parseValue();
      ivars.set(symbolOf(key), value);
    }
    return obj;
  }

  parseFloatValue(): number {
    const len = this.readLong();
    const str = new TextDecoder().decode(this.readBytes(len));
    const v = Number(str);
    const out = Number.isFinite(v) ? v : 0;
    this.#objects.push(out); // Float 可被 '@' 链接
    return out;
  }

  parseBignum(): bigint {
    const sign = this.readByte() === 0x2d ? -1n : 1n;
    const words = this.readLong() * 2;
    let v = 0n;
    for (let i = 0; i < words; i++) v |= BigInt(this.readByte()) << BigInt(8 * i);
    const out = sign * v;
    this.#objects.push(out); // Bignum 可被 '@' 链接
    return out;
  }

  /** 'U'（marshal_dump）：类符号 + 普通 Marshal 值；RGSS 中 Table 实为 'u'，此路径保留兼容 */
  parseUserDefined(): { $user: string; $bytes: Uint8Array } {
    const cls = this.parseValue();
    const className = symbolOf(cls);
    if (className === "Table") {
      const out = this.#readTable(this.#buf.length - this.#pos);
      this.#objects.push(out);
      return out;
    }
    throw new Error(`不支持 UserDefined 类 ${className}`);
  }

  /** 'u'（_dump）：类符号 + Marshal long 长度前缀 + 定长字节串 —— 真实 RGSS Table._dump 格式 */
  parseUserDefinedBytes(): { $user: string; $bytes: Uint8Array } {
    const cls = this.parseValue();
    const className = symbolOf(cls);
    const declared = this.readLong();
    if (declared < 0) throw new Error(`UserDefined 字节串长度非法：${declared}`);
    // 声明长度可能超出剩余缓冲：按剩余字节夹取，避免越界读
    const limit = Math.min(declared, Math.max(0, this.#buf.length - this.#pos));
    // 载荷为不透明字节串，不登记；_dump 对象本身在载荷之后登记（与 Ruby w_remember 顺序一致）
    const out =
      className === "Table"
        ? this.#readTable(limit)
        : { $user: className, $bytes: new Uint8Array(this.readBytes(limit)) }; // Color/Tone 等按字节透传
    this.#objects.push(out);
    return out;
  }

  /**
   * Table._dump 载荷解码：头 20 字节（5×int32，[16..19] 为元素个数）+ count×int16 LE。
   * 读取受 `limit` 约束（'u' 用声明长度，'U' 用剩余缓冲），count 由载荷头决定。
   */
  #readTable(limit: number): { $user: string; $bytes: Uint8Array } {
    const at = this.#pos;
    const headerLen = Math.max(0, Math.min(20, Math.max(0, limit), this.#buf.length - at));
    const header = this.#buf.subarray(at, at + headerLen);
    const count =
      headerLen >= 20 ? header[16]! | (header[17]! << 8) | (header[18]! << 16) | (header[19]! << 24) : 0;
    // 数据偏移夹取非负，避免负 count 回退读取位置
    const dataLen = Math.min(Math.max(0, count * 2), Math.max(0, limit - headerLen));
    const data = this.#buf.subarray(at + headerLen, at + headerLen + dataLen);
    const bytes = new Uint8Array(headerLen + dataLen);
    bytes.set(header, 0);
    bytes.set(data, headerLen);
    this.#pos += headerLen + dataLen;
    return { $user: "Table", $bytes: bytes };
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
