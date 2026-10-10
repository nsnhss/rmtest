/**
 * LCF 二进制读取器（RPG Maker 2000/2003）。
 * 编码依据 liblcf（EasyRPG/liblcf，MIT）：
 * - BER 压缩整数（7 bit/组，MSB 组序在前，0x80 续位，≤5 组）用于 int32/bool/chunk 头；
 * - 字符串 = BER 长度 + 原始字节；
 * - 结构 = [BER id][BER len][len 字节载荷]…，id=0 终止；
 * - vector<结构> = BER 计数 + 每元素 [BER 元素 id][该元素的结构块]；
 * - vector<int16> = 定长小端；vector<事件命令> = 命令序列 + 4 零字节终止。
 */

export class LcfReader {
  private readonly buf: Uint8Array;
  private pos = 0;

  constructor(bytes: Uint8Array) {
    this.buf = bytes;
  }

  get eof(): boolean {
    return this.pos >= this.buf.length;
  }

  get position(): number {
    return this.pos;
  }

  peek(): number {
    return this.buf[this.pos] ?? -1;
  }

  skip(n: number): void {
    this.pos = Math.min(this.pos + n, this.buf.length);
  }

  /** BER 压缩整数 */
  readInt(): number {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.buf[this.pos++];
      if (b === undefined) return 0;
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) return value >>> 0;
    }
    return 0;
  }

  readInt16(): number {
    const lo = this.buf[this.pos++];
    const hi = this.buf[this.pos++];
    if (lo === undefined || hi === undefined) return 0;
    const v = lo | (hi << 8);
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  /** UTF-8 优先，非法序列回退 latin1（2k/2k3 本地代码页字节保底不丢） */
  readString(len: number): string {
    const bytes = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      let out = "";
      for (const b of bytes) out += String.fromCharCode(b);
      return out;
    }
  }

  readBytes(len: number): Uint8Array {
    const bytes = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return bytes;
  }

  /** 结构块：id → (载荷长度) => void；未知 id 跳过；id=0 终止 */
  readStruct(handlers: Record<number, (len: number) => void>): void {
    while (!this.eof) {
      const id = this.readInt();
      if (id === 0) break;
      const len = this.readInt();
      const start = this.pos;
      const handler = handlers[id];
      if (handler) handler(len);
      // 对齐到块尾（handler 未消费完 = 跳过未知子结构）
      const consumed = this.pos - start;
      if (consumed < len) this.skip(len - consumed);
      else if (consumed > len) this.pos = start + len; // 防御：异常消费回卷
    }
  }
}

/** BER 编码（测试夹具编码器 + 校验用） */
export function writeInt(value: number): number[] {
  const groups: number[] = [(value & 0x7f)];
  let v = value >>> 7;
  while (v > 0) {
    groups.push(v & 0x7f);
    v >>>= 7;
  }
  const out: number[] = [];
  for (let i = groups.length - 1; i > 0; i--) out.push(groups[i]! | 0x80);
  out.push(groups[0]!);
  return out;
}
