import { describe, expect, it } from "vitest";
import { decryptAsset, encryptAsset, isEncryptedAsset } from "../src/decrypt.ts";

const KEY = "d41d8cd98f00b204e9800998ecf8427e";

function fakePng(len = 64): Uint8Array {
  const b = new Uint8Array(len);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // PNG 魔数
  for (let i = 8; i < len; i++) b[i] = (i * 37) % 256;
  return b;
}

describe("MV 资源加密往返", () => {
  it("encrypt→decrypt 逐字节还原原文", () => {
    const plain = fakePng(100);
    const enc = encryptAsset(plain, KEY);
    const dec = decryptAsset(enc, KEY);
    expect(Buffer.from(dec).equals(Buffer.from(plain))).toBe(true);
  });

  it("加密文件带 RPG 魔数假头且长度 +16", () => {
    const enc = encryptAsset(fakePng(), KEY);
    expect(enc.length).toBe(64 + 16);
    expect(isEncryptedAsset(enc)).toBe(true);
    expect(enc[0]).toBe(0x52); // R
    expect(enc[1]).toBe(0x50); // P
    expect(enc[2]).toBe(0x47); // G
  });

  it("明文不会被误判为加密", () => {
    expect(isEncryptedAsset(fakePng())).toBe(false);
  });

  it("魔数不符拒绝解密", () => {
    const bad = new Uint8Array(32);
    expect(() => decryptAsset(bad, KEY)).toThrow(/魔数/);
  });
});
