/**
 * GB Studio 工程加载器 —— 静态加载 .gbsproj（单文件模式 / 文件夹模式 project.gbsproj）。
 * 资产存在性在此核对（IR 的 assetFiles.exists 供检查器用）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { type GameUniverse, type IRDocument, readPngSize, universeFromIR } from "@rmtest/core";
import { parseProject } from "./parse.ts";

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

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/** 定位 .gbsproj：文件夹模式 project.gbsproj 优先，其次根目录任意单个 .gbsproj */
export function findProjectFile(dir: string): string | null {
  const folderMode = path.join(dir, "project.gbsproj");
  if (existsSync(folderMode) && statSync(folderMode).isFile()) return folderMode;
  try {
    const singles = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".gbsproj"));
    if (singles.length === 1) return path.join(dir, singles[0]!);
  } catch {
    return null;
  }
  return null;
}

export function loadProject(dir: string): LoadedProject {
  const warnings: string[] = [];
  const fileHashes = new Map<string, string>();
  const assets: AssetInfo[] = [];

  const projectFile = findProjectFile(dir);
  if (!projectFile) {
    warnings.push("缺少 .gbsproj 工程文件（project.gbsproj 或根目录单个 .gbsproj）");
    const ir: IRDocument = emptyIR("gbs", path.basename(dir));
    ir.gbs = {
      startSceneId: "",
      startX: 0,
      startY: 0,
      scenes: [],
      customEvents: [],
      actorPrefabIds: [],
      triggerPrefabIds: [],
      spriteIds: [],
      backgroundIds: [],
      tilesetIds: [],
      soundIds: [],
      musicIds: [],
      emoteIds: [],
      avatarIds: [],
      fontIds: [],
      paletteIds: [],
      assetFiles: [],
    };
    return { ir, universe: universeFromIR(ir), assets, fingerprint: "", fileHashes, warnings };
  }

  const bytes = readFileSync(projectFile);
  fileHashes.set(path.basename(projectFile), hashBytes(bytes));
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    warnings.push(`.gbsproj JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
    json = {};
  }
  const { section, warnings: parseWarnings } = parseProject(json);
  warnings.push(...parseWarnings);

  // 资产存在性核对（相对工程根 = .gbsproj 所在目录）
  for (const asset of section.assetFiles) {
    const diskPath = path.join(dir, asset.filename.replaceAll("/", path.sep));
    asset.exists = existsSync(diskPath) && statSync(diskPath).isFile();
    if (!asset.exists) {
      // 大小写不敏感匹配
      const parent = path.dirname(diskPath);
      const base = path.basename(diskPath).toLowerCase();
      try {
        asset.caseInsensitiveMatch = readdirSync(parent).some((f) => f.toLowerCase() === base);
      } catch {
        asset.caseInsensitiveMatch = false;
      }
      continue;
    }
    const rel = asset.filename;
    const data = readFileSync(diskPath);
    fileHashes.set(rel, hashBytes(data));
    let width = 0;
    let height = 0;
    if (base(rel).toLowerCase().endsWith(".png")) {
      const size = readPngSize(data);
      if (size) {
        width = size.width;
        height = size.height;
      }
    }
    assets.push({ relPath: rel, width, height });
  }

  const ir: IRDocument = emptyIR("gbs", path.basename(dir));
  ir.gbs = section;

  const universe = universeFromIR(ir);
  universe.assetFiles = new Set(assets.map((a) => a.relPath));
  universe.assetFilesLower = new Set(assets.map((a) => a.relPath.toLowerCase()));

  const fingerprint = createHash("sha256")
    .update(JSON.stringify([...fileHashes.entries()].sort()))
    .digest("hex")
    .slice(0, 16);

  return { ir, universe, assets, fingerprint, fileHashes, warnings };
}

function base(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function emptyIR(engine: IRDocument["engine"], title: string): IRDocument {
  return {
    schemaVersion: 3,
    engine,
    system: {
      title,
      switches: [],
      variables: [],
      startMapId: 0,
      startX: 0,
      startY: 0,
      title1Name: "",
      title2Name: "",
      sounds: { bgm: { name: "" }, bgs: { name: "" }, me: { name: "" }, se: { name: "" } },
      vehicles: { boat: { characterName: "" }, ship: { characterName: "" }, airship: { characterName: "" } },
    },
    maps: [],
    actors: [],
    commonEvents: [],
    tilesets: [],
    items: [],
    weapons: [],
    armors: [],
    skills: [],
    troops: [],
    enemies: [],
    animations: [],
    classes: [],
  };
}
