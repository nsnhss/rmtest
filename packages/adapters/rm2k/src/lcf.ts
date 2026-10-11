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

  /** 剩余可读字节数（越界读取后恒为 0） */
  get remaining(): number {
    return Math.max(0, this.buf.length - this.pos);
  }

  peek(): number {
    return this.buf[this.pos] ?? -1;
  }

  skip(n: number): void {
    this.pos = Math.min(this.pos + n, this.buf.length);
  }

  /** BER 压缩整数；已越过缓冲区末尾时返回 0 且不再前进（防止位置飘出缓冲） */
  readInt(): number {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      if (this.pos >= this.buf.length) return 0;
      const b = this.buf[this.pos++]!;
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) return value >>> 0;
    }
    return 0;
  }

  /**
   * 把数据声明的元素计数钳制到字节预算内。LCF 的集合计数来自不可信文件
   * （最大 0xFFFFFFFF），直接按声明值循环会 OOM/挂起；钳制后集合循环的
   * 迭代次数与输入字节线性相关。
   * @param count 数据中声明的元素数
   * @param minBytes 单个元素至少占用的字节数（默认 1）
   * @param budget 元素可用的字节预算，默认整个剩余缓冲（内部再与剩余字节取小）
   */
  boundedCount(count: number, minBytes = 1, budget = this.remaining): number {
    if (!(count > 0)) return 0;
    const bytes = Math.max(0, Math.min(budget, this.remaining));
    const cap = Math.floor(bytes / (minBytes > 0 ? minBytes : 1));
    return count < cap ? count : cap;
  }

  /** UTF-8 优先，非法序列回退 latin1（2k/2k3 本地代码页字节保底不丢） */
  readString(len: number): string {
    const n = Math.max(0, Math.min(len, this.remaining));
    const bytes = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      let out = "";
      for (const b of bytes) out += String.fromCharCode(b);
      return out;
    }
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
