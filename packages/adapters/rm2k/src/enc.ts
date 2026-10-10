/**
 * LCF 编码器 —— 镜像 liblcf 的 writer 语义（BER int / 结构块 / 向量 / 事件命令）。
 * 与解析器同源（liblcf 规范）：测试夹具构造 + 往返验证 + 生成工具复用。
 */
import { writeInt } from "./lcf.ts";

export class Enc {
  private bytes: number[] = [];

  get out(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  raw(ns: number[]): this {
    this.bytes.push(...ns);
    return this;
  }

  int(v: number): this {
    this.bytes.push(...writeInt(v));
    return this;
  }

  str(s: string): this {
    const bytes = new TextEncoder().encode(s);
    this.int(bytes.length);
    for (const b of bytes) this.bytes.push(b);
    return this;
  }

  /** 结构块：BER id + BER 长度 + 载荷 */
  chunk(id: number, payload: number[]): this {
    this.int(id);
    this.int(payload.length);
    this.bytes.push(...payload);
    return this;
  }

  intField(id: number, v: number): this {
    return this.chunk(id, writeInt(v));
  }

  strField(id: number, s: string): this {
    return this.chunk(id, Array.from(new TextEncoder().encode(s)));
  }

  /** 子结构字段（载荷 = 子结构块序列 + 0 终止） */
  structField(id: number, inner: number[]): this {
    return this.chunk(id, [...inner, 0]);
  }

  /** 结构向量字段：BER 计数 + 每元素 [BER 元素 id][结构块 + 0] */
  structVecField(id: number, elems: Array<{ id: number; body: number[] }>): this {
    const payload: number[] = writeInt(elems.length);
    for (const e of elems) payload.push(...writeInt(e.id), ...e.body, 0);
    return this.chunk(id, payload);
  }

  /** 事件命令：code/indent/string/params 全 BER 前缀 */
  static command(code: number, indent: number, str: string, params: number[]): number[] {
    const strBytes = Array.from(new TextEncoder().encode(str));
    const out: number[] = [...writeInt(code), ...writeInt(indent)];
    out.push(...writeInt(strBytes.length), ...strBytes);
    out.push(...writeInt(params.length));
    for (const p of params) out.push(...writeInt(p));
    return out;
  }

  /** 命令列表字段：命令序列 + 4 零字节终止 */
  commandsField(id: number, cmds: number[][]): this {
    const payload: number[] = [];
    for (const c of cmds) payload.push(...c);
    payload.push(0, 0, 0, 0);
    return this.chunk(id, payload);
  }
}

/** 头字符串 + 载荷（LMT/LMU/LDB 均以字符串开头） */
export function withHeader(header: string, payload: Enc): Uint8Array {
  const e = new Enc().str(header);
  const head = e.out;
  const body = payload.out;
  const merged = new Uint8Array(head.length + body.length);
  merged.set(head, 0);
  merged.set(body, head.length);
  return merged;
}
