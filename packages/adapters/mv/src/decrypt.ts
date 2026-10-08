/**
 * MV/MZ 资源加密/解密（自实现，避开现成解密器的许可风险）。
 *
 * 加密文件结构（.rpgmvp / .rpgmvo / .rpgmvm）：
 *   [0..15]  16 字节假文件头（"RPG" 魔数 + 版本字节 + 填充）
 *   [16..31] 原文件头 16 字节 XOR 密钥流
 *   [32..]   原文件剩余内容原样
 * 密钥流 = System.json 的 encryptionKey 字节循环填充到 16 字节。
 *
 * 注意：此实现依据公开的格式文档自实现；真实 MV/MZ 资源文件的
 * 端到端验证需要真实游戏工程（后续用用户自有的未加密/加密工程补测）。
 */

export function deriveKeyStream(encryptionKey: string): Uint8Array {
  const key = new TextEncoder().encode(encryptionKey);
  const stream = new Uint8Array(16);
  for (let i = 0; i < 16; i++) stream[i] = key[i % key.length]!;
  return stream;
}

const FAKE_HEADER = new Uint8Array([0x52, 0x50, 0x47, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // "RPG" + 版本 1

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
