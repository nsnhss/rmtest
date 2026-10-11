/** 测试辅助：Marshal 编码器（只写需要的子集，用于构造 RGSS 数据 fixture） */
import type { MarshalValue } from "../src/marshal.ts";

function long(n: number): number[] {
  // Marshal long：与 ruby_marshal_write_long 一致（小端补码 + 有符号长度前缀）
  if (n === 0) return [0];
  if (n > 0 && n < 123) return [n + 5];
  if (n > -124 && n < 0) return [(n - 5) & 0xff];
  const out: number[] = [];
  let x = n;
  for (let i = 1; i <= 4; i++) {
    out.push(x & 0xff);
    x = Math.floor(x / 256);
    if (x === 0) return [i, ...out];
    if (x === -1) return [(-i) & 0xff, ...out];
  }
  throw new Error(`编码器 long 超出 4 字节: ${n}`);
}

function str(s: string): number[] {
  const bytes = new TextEncoder().encode(s);
  return [0x22, ...long(bytes.length), ...bytes];
}

/** VX Ace Table dump 载荷：头 5×int32（dims,xsize,ysize,zsize,count）+ count×int16 LE */
export function encodeTablePayload(data: number[], dims = 1, xsize = data.length, ysize = 1, zsize = 1): number[] {
  const i32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const out = [...i32(dims), ...i32(xsize), ...i32(ysize), ...i32(zsize), ...i32(data.length)];
  for (const v of data) {
    const u = v < 0 ? v + 0x10000 : v;
    out.push(u & 0xff, (u >>> 8) & 0xff);
  }
  return out;
}

export function encodeMarshal(v: unknown): Uint8Array {
  const bytes: number[] = [0x04, 0x08];

  const enc = (val: unknown): void => {
    if (val === null) {
      bytes.push(0x30);
    } else if (val === true) {
      bytes.push(0x54);
    } else if (val === false) {
      bytes.push(0x46);
    } else if (typeof val === "number" && Number.isInteger(val)) {
      bytes.push(0x69, ...long(val));
    } else if (typeof val === "string") {
      bytes.push(...str(val));
    } else if (Array.isArray(val)) {
      bytes.push(0x5b, ...long(val.length));
      for (const item of val) enc(item);
    } else if (typeof val === "object" && "$sym" in (val as object)) {
      bytes.push(0x3a, ...long((val as { $sym: string }).$sym.length), ...new TextEncoder().encode((val as { $sym: string }).$sym));
    } else if (val !== null && typeof val === "object" && "$link" in val) {
      // '@' 对象链接：引用对象表中已登记对象的索引
      const index = val.$link;
      if (typeof index !== "number") throw new Error(`编码器 $link 索引非数字: ${String(index)}`);
      bytes.push(0x40, ...long(index));
    } else if (typeof val === "object" && "$user" in (val as object)) {
      const { $user } = val as { $user: { cls: string; bytes: number[] } };
      bytes.push(0x55, 0x3a, ...long($user.cls.length), ...new TextEncoder().encode($user.cls), ...$user.bytes);
    } else if (typeof val === "object" && "$utable" in (val as object)) {
      // 真实 RGSS 格式：'u' + 类符号 + long(载荷长) + 载荷
      const { $utable } = val as { $utable: { cls: string; payload: number[] } };
      bytes.push(
        0x75,
        0x3a,
        ...long($utable.cls.length),
        ...new TextEncoder().encode($utable.cls),
        ...long($utable.payload.length),
        ...$utable.payload,
      );
    } else if (typeof val === "object" && "$obj" in (val as object)) {
      const { $obj } = val as { $obj: { cls: string; ivars: Record<string, unknown> } };
      bytes.push(0x6f, 0x3a, ...long($obj.cls.length), ...new TextEncoder().encode($obj.cls));
      const entries = Object.entries($obj.ivars);
      bytes.push(...long(entries.length));
      for (const [k, iv] of entries) {
        bytes.push(0x3a, ...long(k.length), ...new TextEncoder().encode(k));
        enc(iv);
      }
    } else if (typeof val === "object" && "$hash" in (val as object)) {
      const pairs = (val as { $hash: Array<[unknown, unknown]> }).$hash;
      bytes.push(0x7b, ...long(pairs.length));
      for (const [k, iv] of pairs) {
        enc(k);
        enc(iv);
      }
    } else {
      throw new Error(`编码器不支持: ${String(val)}`);
    }
  };

  enc(v);
  return new Uint8Array(bytes);
}

export type { MarshalValue };
