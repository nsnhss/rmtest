/**
 * TyranoScript 工程加载器 —— 静态加载（场景脚本 + 资产清单 + 配置）。
 * 动态执行（真实 Tyrano 运行时）不在静态加载器范围；需要真实游戏工程。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  type GameUniverse,
  type IRDocument,
  type IRTyranoSection,
  readPngSize,
  universeFromIR,
} from "@rmtest/core";
import { parseConfig, parseScenario } from "./parse.ts";

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

/** 资产类别 → data/ 子目录 */
const ASSET_DIRS: Array<[keyof IRTyranoSection["assets"], string]> = [
  ["bg", "bgimage"],
  ["fg", "fgimage"],
  ["image", "image"],
  ["se", "sound"],
  ["bgm", "bgm"],
  ["voice", "voice"],
  ["video", "video"],
];

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export function loadProject(dir: string): LoadedProject {
  const warnings: string[] = [];
  const fileHashes = new Map<string, string>();
  const assets: AssetInfo[] = [];
  const assetNames: IRTyranoSection["assets"] = { bg: [], fg: [], image: [], se: [], bgm: [], voice: [], video: [] };

  // 场景脚本
  const scenarioDir = path.join(dir, "data", "scenario");
  const scenarioFiles = existsSync(scenarioDir)
    ? readdirSync(scenarioDir)
        .filter((f) => f.toLowerCase().endsWith(".ks") && statSync(path.join(scenarioDir, f)).isFile())
        .sort()
    : [];
  if (scenarioFiles.length === 0) warnings.push("缺少 data/scenario/*.ks 场景文件");

  const scenarios = scenarioFiles.map((f) => {
    const bytes = readFileSync(path.join(scenarioDir, f));
    fileHashes.set(`data/scenario/${f}`, hashBytes(bytes));
    return parseScenario(f, bytes.toString("utf8"));
  });

  // 配置（入口场景/标签）
  const configPath = path.join(dir, "data", "system", "Config.tjs");
  let configText: string | null = null;
  if (existsSync(configPath)) {
    const bytes = readFileSync(configPath);
    configText = bytes.toString("utf8");
    fileHashes.set("data/system/Config.tjs", hashBytes(bytes));
  } else {
    warnings.push("缺少 data/system/Config.tjs，按默认入口（first.ks/*start）处理");
  }
  const config = parseConfig(configText);

  // 运行入口
  const indexPath = path.join(dir, "index.html");
  if (existsSync(indexPath)) {
    fileHashes.set("index.html", hashBytes(readFileSync(indexPath)));
  } else {
    warnings.push("缺少 index.html（TyranoScript 运行入口）");
  }

  // 资产清单
  for (const [kind, sub] of ASSET_DIRS) {
    const d = path.join(dir, "data", sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).sort()) {
      const full = path.join(d, f);
      if (!statSync(full).isFile()) continue;
      const rel = `data/${sub}/${f}`;
      assetNames[kind].push(f);
      fileHashes.set(rel, hashBytes(readFileSync(full)));
      let width = 0;
      let height = 0;
      if (f.toLowerCase().endsWith(".png")) {
        const size = readPngSize(readFileSync(full));
        if (size) {
          width = size.width;
          height = size.height;
        }
      }
      assets.push({ relPath: rel, width, height });
    }
  }

  const ir: IRDocument = {
    schemaVersion: 2,
    engine: "tyrano",
    system: {
      title: config.title || path.basename(dir),
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
    tyrano: {
      scenarios,
      assets: assetNames,
      entryScenario: config.firstScenario,
      entryLabel: config.firstLabel,
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
