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

  // golden 向量：按实测的真实文件格式独立构造（假头 "RPGMV"+填充，[16..32) = 明文 XOR 十六进制解码密钥）。
  // 与生产代码无耦合——若用 ASCII 密钥推导，解出的是 39 79 F3 FA… 而非 PNG 魔数。
  it("真实格式 golden 向量：十六进制密钥解出 PNG 头", () => {
    const cipher = new Uint8Array([
      0x52, 0x50, 0x47, 0x4d, 0x56, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x5d, 0x4d, 0xc2, 0x9e, 0x82, 0x0a, 0xa8, 0x0e, 0xe9, 0x80, 0x09, 0x95, 0xa5, 0xb0, 0x06, 0x2c,
    ]);
    const plain = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    expect(Buffer.from(decryptAsset(cipher, KEY)).equals(Buffer.from(plain))).toBe(true);
  });

  it("非十六进制密钥回退字节循环，往返仍成立", () => {
    const plain = fakePng(64);
    const enc = encryptAsset(plain, "not-a-hex-key");
    expect(Buffer.from(decryptAsset(enc, "not-a-hex-key")).equals(Buffer.from(plain))).toBe(true);
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
