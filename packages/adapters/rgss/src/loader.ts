/**
 * RGSS 工程加载器 —— VX Ace（.rvdata2）/ XP（.rxdata）/ VX（.rvdata）静态加载。
 * 资产目录映射到 MV 风格路径（img/... audio/...），全部既有检查器直接复用。
 * 动态执行（mkxp-z）不在静态加载器范围。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { type GameUniverse, type IRDocument, readPngSize, universeFromIR } from "@rmtest/core";
import { createHash } from "node:crypto";
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
  fileHashes: Map<string, string>;
  warnings: string[];
}

/** Graphics 子目录 → MV 风格前缀 */
const GRAPHICS_MAP: Record<string, string> = {
  Characters: "img/characters/",
  Faces: "img/faces/",
  Parallaxes: "img/parallaxes/",
  Battlebacks1: "img/battlebacks1/",
  Battlebacks2: "img/battlebacks2/",
  Pictures: "img/pictures/",
  Titles1: "img/titles1/",
  System: "img/system/",
  Tilesets: "img/tilesets/",
  Animations: "img/animations/",
  Enemies: "img/enemies/",
  Battlers: "img/sv_actors/",
};

const AUDIO_MAP: Record<string, string> = {
  BGM: "audio/bgm/",
  BGS: "audio/bgs/",
  ME: "audio/me/",
  SE: "audio/se/",
};

const DATA_EXTS = [".rvdata2", ".rvdata", ".rxdata"];

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export function loadProject(dir: string): LoadedProject {
  const warnings: string[] = [];
  const files: Record<string, Uint8Array> = {};
  const fileHashes = new Map<string, string>();

  const dataDir = path.join(dir, "Data");
  try {
    for (const name of readdirSync(dataDir)) {
      if (!DATA_EXTS.some((ext) => name.endsWith(ext))) continue;
      const full = path.join(dataDir, name);
      try {
        const bytes = readFileSync(full);
        files[name] = bytes;
        fileHashes.set(`Data/${name}`, hashBytes(bytes));
      } catch (err) {
        warnings.push(`读取 ${name} 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch {
    warnings.push("缺少 Data/ 目录");
  }

  const { ir, warnings: parseWarnings } = parseData(files);
  warnings.push(...parseWarnings);

  const universe = universeFromIR(ir);
  const assets: AssetInfo[] = [];

  // 资产映射：Graphics/* → img/*，Audio/* → audio/*
  const collect = (sub: string, prefix: string, audio: boolean) => {
    const subDir = path.join(dir, sub);
    let names: string[];
    try {
      names = readdirSync(subDir);
    } catch {
      return;
    }
    for (const name of names) {
      const full = path.join(subDir, name);
      if (statSync(full).isDirectory()) continue;
      const rel = `${prefix}${name}`;
      universe.assetFiles.add(rel);
      universe.assetFilesLower.add(rel.toLowerCase());
      const bytes = readFileSync(full);
      fileHashes.set(rel, hashBytes(bytes));
      if (audio) {
        const ext = path.extname(name).toLowerCase();
        universe.assetFiles.add(rel.slice(0, -ext.length)); // 无扩展名别名（引用约定）
        universe.assetFilesLower.add(rel.slice(0, -ext.length).toLowerCase());
      } else if (name.endsWith(".png")) {
        const info = readPngSize(bytes);
        if (info) assets.push({ relPath: rel, width: info.width, height: info.height });
      }
    }
  };
  for (const [sub, prefix] of Object.entries(GRAPHICS_MAP)) collect(path.join("Graphics", sub), prefix, false);
  for (const [sub, prefix] of Object.entries(AUDIO_MAP)) collect(path.join("Audio", sub), prefix, true);

  // 图标数量：System/IconSet.png
  const iconSet = assets.find((a) => a.relPath.toLowerCase() === "img/system/iconset.png");
  if (iconSet) universe.iconCount = Math.floor(iconSet.width / 32) * Math.floor(iconSet.height / 32);

  const fingerprint = hashBytes(new TextEncoder().encode([...fileHashes.entries()].map(([p, h]) => `${p}:${h}`).sort().join("\n")));

  return { ir, universe, assets, fingerprint, fileHashes, warnings };
}
