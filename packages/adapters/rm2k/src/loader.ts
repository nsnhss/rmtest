/**
 * RM2k/2k3 工程加载器 —— RPG_RT.ldb/.lmt + MapXXXX.lmu + 资产目录清单。
 * 编码为本地代码页（latin1 保底），文件名匹配一律大小写不敏感（2k/2k3 磁盘文件惯例小写）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { GameUniverse, IRDocument, IRRm2kCommand, IRRm2kMap, IRRm2kMapInfo } from "@rmtest/core";
import { universeFromIR } from "@rmtest/core";
import { parseLdb, parseLmt, parseLmu } from "./parse.ts";

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

const ASSET_DIRS = [
  "music",
  "sound",
  "charset",
  "faceset",
  "picture",
  "panorama",
  "system",
  "system2",
  "battle",
  "battle2",
  "chipset",
  "title",
  "gameover",
  "frame",
  "backdrop",
];

const MAP_FILE_RE = /^map(\d+)\.lmu$/i;

export function loadProject(dir: string): LoadedProject {
  const warnings: string[] = [];
  const fileHashes = new Map<string, string>();
  const assets: AssetInfo[] = [];
  const assetDirs: Record<string, string[]> = {};

  // 资产目录清单
  for (const d of ASSET_DIRS) {
    const full = path.join(dir, d);
    if (!existsSync(full)) continue;
    try {
      for (const f of readdirSync(full)) {
        const p = path.join(full, f);
        if (!statSync(p).isFile()) continue;
        assetDirs[d] = assetDirs[d] ?? [];
        assetDirs[d]!.push(f);
        const rel = `${d}/${f}`;
        const data = readFileSync(p);
        fileHashes.set(rel, hashBytes(data));
        assets.push({ relPath: rel, width: 0, height: 0 });
      }
    } catch {
      // 目录不可读：跳过
    }
  }

  const ldbPath = path.join(dir, "RPG_RT.ldb");
  const lmtPath = path.join(dir, "RPG_RT.lmt");
  if (!existsSync(ldbPath)) warnings.push("缺少 RPG_RT.ldb（数据库）");
  if (!existsSync(lmtPath)) warnings.push("缺少 RPG_RT.lmt（地图树）");

  // LDB
  let db = {
    version: 0,
    title: "",
    switches: [] as string[],
    variables: [] as string[],
    commonEvents: [] as Array<{ id: number; name: string; commands: IRRm2kCommand[] }>,
    chipsets: {} as Record<number, string>,
    animations: {} as Record<number, string>,
  };
  if (existsSync(ldbPath)) {
    const bytes = readFileSync(ldbPath);
    fileHashes.set("RPG_RT.ldb", hashBytes(bytes));
    db = parseLdb(bytes);
  }

  // LMT
  let mapTree: IRRm2kMapInfo[] = [];
  let start = { mapId: 0, x: 0, y: 0 };
  if (existsSync(lmtPath)) {
    const bytes = readFileSync(lmtPath);
    fileHashes.set("RPG_RT.lmt", hashBytes(bytes));
    const lmt = parseLmt(bytes);
    mapTree = lmt.maps;
    start = lmt.start;
  }

  // LMU
  const maps: IRRm2kMap[] = [];
  try {
    for (const f of readdirSync(dir)) {
      const m = MAP_FILE_RE.exec(f);
      if (!m) continue;
      const id = parseInt(m[1]!, 10);
      const bytes = readFileSync(path.join(dir, f));
      fileHashes.set(f, hashBytes(bytes));
      const lmu = parseLmu(bytes);
      maps.push({
        id,
        chipsetId: lmu.chipsetId,
        width: lmu.width,
        height: lmu.height,
        parallaxName: lmu.parallaxName,
        events: lmu.events,
      });
    }
  } catch {
    warnings.push("Map*.lmu 目录读取失败");
  }

  const ir: IRDocument = {
    schemaVersion: 5,
    engine: "rm2k",
    system: {
      title: db.title || path.basename(dir),
      switches: db.switches,
      variables: db.variables,
      startMapId: start.mapId,
      startX: start.x,
      startY: start.y,
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
    rm2k: {
      version: db.version,
      mapTree,
      start,
      maps,
      switches: db.switches,
      variables: db.variables,
      commonEvents: db.commonEvents,
      chipsets: db.chipsets,
      animations: db.animations,
      assetDirs,
    },
  };

  const universe = universeFromIR(ir);
  universe.assetFiles = new Set(assets.map((a) => a.relPath));
  universe.assetFilesLower = new Set(assets.map((a) => a.relPath.toLowerCase()));

  const fingerprint = createHash("sha256")
    .update(JSON.stringify([...fileHashes.entries()].sort()))
    .digest("hex")
    .slice(0, 16);

  return { ir, universe, assets, fingerprint, fileHashes, warnings };
}
