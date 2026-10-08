/**
 * PNG 尺寸解析 —— 只读 IHDR 头，不依赖图像库。
 * 用于行走图/脸图规格检查与图标数量计算。
 */
export interface PngInfo {
  width: number;
  height: number;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function readPngSize(buf: Uint8Array): PngInfo | null {
  if (buf.length < 24) return null;
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIGNATURE[i]) return null;
  }
  // IHDR chunk: length(4) type(4) width(4) height(4)
  const type = String.fromCharCode(buf[12]!, buf[13]!, buf[14]!, buf[15]!);
  if (type !== "IHDR") return null;
  const width = (buf[16]! << 24) | (buf[17]! << 16) | (buf[18]! << 8) | buf[19]!;
  const height = (buf[20]! << 24) | (buf[21]! << 16) | (buf[22]! << 8) | buf[23]!;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}
