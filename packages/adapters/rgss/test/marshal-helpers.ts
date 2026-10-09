/** 测试辅助：Marshal 编码器（只写需要的子集，用于构造 RGSS 数据 fixture） */
import type { MarshalValue } from "../src/marshal.ts";

function long(n: number): number[] {
  // Marshal long：与 fixnum 同编码（无标签）
  if (n === 0) return [0];
  if (n > 0 && n < 123) return [n + 5];
  if (n < 0 && n > -124) return [n + 256 - 5];
  const out: number[] = [];
  let v = n;
  while (v > 0 || out.length === 0) {
    out.push(v & 0xff);
    v = Math.floor(v / 256);
  }
  const tag = out.length === 1 ? 1 : out.length === 2 ? 2 : out.length === 3 ? 3 : 4;
  return [tag, ...out.slice(0, 4)];
}

function str(s: string): number[] {
  const bytes = new TextEncoder().encode(s);
  return [0x22, ...long(bytes.length), ...bytes];
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
    } else if (typeof val === "object" && "$user" in (val as object)) {
      const { $user } = val as { $user: { cls: string; bytes: number[] } };
      bytes.push(0x55, 0x3a, ...long($user.cls.length), ...new TextEncoder().encode($user.cls), ...$user.bytes);
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
