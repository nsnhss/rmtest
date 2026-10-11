/**
 * MV/MZ 资源加密/解密（自实现，避开现成解密器的许可风险）。
 *
 * 加密文件结构（.rpgmvp / .rpgmvo / .rpgmvm，MZ 为 .png_ / .ogg_ / .webm_）：
 *   [0..15]  16 字节假文件头（"RPGMV" 魔数 + 版本/填充）
 *   [16..31] 原文件头 16 字节 XOR 密钥流
 *   [32..]   原文件剩余内容原样
 * 密钥流 = System.json 的 encryptionKey（32 位十六进制）**解码后的 16 字节**。
 *
 * 实证：真实工程 img/*.rpgmvp 与 MZ *.png_ 的 [16..32) 用十六进制解码密钥异或后
 * 得到 PNG 魔数 89 50 4E 47 0D 0A 1A 0A；用 ASCII 字节异或得到垃圾。假头实测为
 * 52 50 47 4D 56 00 00 00 00 00 03 01 00 00 00 00。
 */

const HEX_KEY = /^[0-9a-fA-F]{32}$/;

export function deriveKeyStream(encryptionKey: string): Uint8Array {
  const stream = new Uint8Array(16);
  // MV/MZ 的 encryptionKey 是 32 位十六进制 → 解码为 16 字节密钥流
  if (HEX_KEY.test(encryptionKey)) {
    for (let i = 0; i < 16; i++) stream[i] = Number.parseInt(encryptionKey.slice(i * 2, i * 2 + 2), 16);
    return stream;
  }
  // 回退：非十六进制密钥按字节循环填充（历史行为，无实证格式）
  const key = new TextEncoder().encode(encryptionKey);
  if (key.length === 0) return stream;
  for (let i = 0; i < 16; i++) stream[i] = key[i % key.length]!;
  return stream;
}

/** 实测的真实假文件头："RPGMV" + 5 空 + 0x03 0x01 + 4 空 */
const FAKE_HEADER = new Uint8Array([
  0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 0, 0x03, 0x01, 0, 0, 0, 0,
]);

export function encryptAsset(plain: Uint8Array, encryptionKey: string): Uint8Array {
  if (plain.length < 16) throw new Error("明文过短，资源至少 16 字节");
  const stream = deriveKeyStream(encryptionKey);
  const out = new Uint8Array(plain.length + 16);
  out.set(FAKE_HEADER, 0);
  for (let i = 0; i < 16; i++) out[16 + i] = plain[i]! ^ stream[i]!;
  out.set(plain.subarray(16), 32);
  return out;
}

export function decryptAsset(encrypted: Uint8Array, encryptionKey: string): Uint8Array {
  if (encrypted.length < 32) throw new Error("加密文件过短，不是合法的 MV/MZ 资源");
  if (encrypted[0] !== 0x52 || encrypted[1] !== 0x50 || encrypted[2] !== 0x47) {
    throw new Error("假文件头魔数不匹配");
  }
  const stream = deriveKeyStream(encryptionKey);
  const out = new Uint8Array(encrypted.length - 16);
  for (let i = 0; i < 16; i++) out[i] = encrypted[16 + i]! ^ stream[i]!;
  out.set(encrypted.subarray(32), 16);
  return out;
}

export function isEncryptedAsset(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0x52 && bytes[1] === 0x50 && bytes[2] === 0x47;
}
