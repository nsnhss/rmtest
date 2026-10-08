/**
 * 工程加载器 —— 从 MV/MZ 工程目录构建 { IR, universe, 资源清单, 指纹 }。
 * 容错原则：缺目录/坏文件不崩，记入 warnings。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { type GameUniverse, type IRDocument, universeFromIR } from "@rmtest/core";
import { decryptAsset, isEncryptedAsset } from "./decrypt.ts";
import { fingerprintTree, hashBytes } from "./fingerprint.ts";
import { readPngSize } from "./png.ts";
import { parseData } from "./parse.ts";

export interface AssetInfo {
  relPath: string;
  width: number;
  height: number;
}

export interface LoadedProject {
  ir: IRDocument;
  universe: GameUniverse;
  assets: AssetInfo[];
  fingerprint: string;
  warnings: string[];
}

/** 加密扩展名 → 原文扩展名映射（部署产物） */
const ENCRYPTED_EXT: Record<string, string> = {
  ".rpgmvp": ".png",
  ".rpgmvo": ".ogg",
  ".rpgmvm": ".m4v",
};

const ASSET_DIRS = ["img", "audio", "movies", "fonts"] as const;

export function loadProject(dir: string, engine: "mv" | "mz" = "mv"): LoadedProject {
  const warnings: string[] = [];
  const files: Record<string, unknown> = {};

  const dataDir = path.join(dir, "data");
  try {
    for (const name of readdirSync(dataDir)) {
      if (!name.endsWith(".json")) continue;
      try {
        files[name] = JSON.parse(readFileSync(path.join(dataDir, name), "utf8"));
      } catch (err) {
        warnings.push(`数据文件 ${name} 解析失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch {
    warnings.push("缺少 data/ 目录");
  }

  const { ir, warnings: parseWarnings } = parseData(files, engine);
  warnings.push(...parseWarnings);

  const universe = universeFromIR(ir);
  const assets: AssetInfo[] = [];
  const fileHashes = new Map<string, string>();
  const encryptionKey = String((files["System.json"] as Record<string, unknown> | undefined)?.["encryptionKey"] ?? "");

  for (const sub of ASSET_DIRS) {
    collectAssets(path.join(dir, sub), sub, universe, assets, fileHashes, encryptionKey, warnings);
  }

  // 数据文件参与指纹
  for (const [name, content] of Object.entries(files)) {
    fileHashes.set(`data/${name}`, hashBytes(new TextEncoder().encode(JSON.stringify(content))));
  }

  // 图标数量：IconSet.png 每格 32px
  const iconSet = assets.find((a) => a.relPath.toLowerCase() === "img/system/iconset.png");
  if (iconSet) universe.iconCount = Math.floor(iconSet.width / 32) * Math.floor(iconSet.height / 32);

  return { ir, universe, assets, fingerprint: fingerprintTree(fileHashes), warnings };
}

function collectAssets(
  dir: string,
  relRoot: string,
  universe: GameUniverse,
  assets: AssetInfo[],
  fileHashes: Map<string, string>,
  encryptionKey: string,
  warnings: string[],
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // 目录缺失是合法的（如无 movies/）
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      collectAssets(full, `${relRoot}/${name}`, universe, assets, fileHashes, encryptionKey, warnings);
      continue;
    }
    const rel = `${relRoot}/${name}`.replaceAll("\\", "/");
    // 部署产物：加密名映射回原扩展名，让数据里的引用能对上
    const ext = path.extname(name).toLowerCase();
    const mappedRel = ENCRYPTED_EXT[ext] ? rel.slice(0, -ext.length) + ENCRYPTED_EXT[ext]! : rel;

    let bytes: Uint8Array;
    try {
      bytes = readFileSync(full);
    } catch (err) {
      warnings.push(`读取 ${rel} 失败: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    universe.assetFiles.add(mappedRel);
    universe.assetFilesLower.add(mappedRel.toLowerCase());
    fileHashes.set(mappedRel, hashBytes(bytes));

    if (mappedRel.endsWith(".png")) {
      let plain = bytes;
      if (isEncryptedAsset(bytes)) {
        if (!encryptionKey) {
          warnings.push(`加密资源 ${rel} 缺少 encryptionKey，无法解析尺寸`);
          continue;
        }
        try {
          plain = decryptAsset(bytes, encryptionKey);
        } catch (err) {
          warnings.push(`解密 ${rel} 失败: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
      }
      const info = readPngSize(plain);
      if (!info) {
        warnings.push(`PNG 尺寸解析失败: ${rel}`);
        continue;
      }
      assets.push({ relPath: mappedRel, width: info.width, height: info.height });
    }
  }
}
