/**
 * Godot 工程加载器 —— 静态加载：project.godot 配置 + .tscn/.escn/.tres 文本解析 +
 * 全文件清单 + uid 映射 + .gd 函数清单。
 * 二进制 .res/.scn 不解析（列入文件清单，供存在性检查）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { type GameUniverse, type IRDocument, type IRGodotScene, type IRGodotResource, universeFromIR } from "@rmtest/core";
import { extractFuncs, extractNodePaths, parseProjectConfig, parseTextResource } from "./parse.ts";

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

const SCENE_EXTS = [".tscn", ".escn"];
const RESOURCE_EXTS = [".tres"];
const SCRIPT_EXT = ".gd";
const SKIP_DIRS = new Set([".godot", ".git", "node_modules"]);

/** 递归收集工程文件（跳过 .godot/.git/node_modules 与 *.import） */
function walkFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      const relPath = rel.length > 0 ? `${rel}/${name}` : name;
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          if (!SKIP_DIRS.has(name)) walk(full, relPath);
        } else if (!name.endsWith(".import")) {
          out.push(relPath);
        }
      } catch {
        // 权限/符号链接问题：跳过
      }
    }
  };
  walk(root, "");
  return out;
}

export function loadProject(dir: string): LoadedProject {
  const warnings: string[] = [];
  const fileHashes = new Map<string, string>();
  const assets: AssetInfo[] = [];

  const projectFile = path.join(dir, "project.godot");
  if (!existsSync(projectFile)) {
    warnings.push("缺少 project.godot（Godot 工程入口）");
  }

  const files = walkFiles(dir);

  // 配置文件
  let config = { mainScene: null as string | null, autoloads: [] as Array<{ name: string; path: string }> };
  if (existsSync(projectFile)) {
    const bytes = readFileSync(projectFile);
    fileHashes.set("project.godot", hashBytes(bytes));
    config = parseProjectConfig(bytes.toString("utf8"));
  }

  // 场景/资源/脚本解析
  const scenes: IRGodotScene[] = [];
  const resources: IRGodotResource[] = [];
  const scriptFuncs: Record<string, string[]> = {};
  const scriptNodePaths: Record<string, string[]> = {};
  const uidToPath: Record<string, string> = {};

  for (const rel of files) {
    const lower = rel.toLowerCase();
    const full = path.join(dir, rel);
    const isScene = SCENE_EXTS.some((e) => lower.endsWith(e));
    const isResource = RESOURCE_EXTS.some((e) => lower.endsWith(e));
    const isScript = lower.endsWith(SCRIPT_EXT);
    if (!isScene && !isResource && !isScript) continue;

    const bytes = readFileSync(full);
    fileHashes.set(rel, hashBytes(bytes));
    const text = bytes.toString("utf8");

    if (isScene || isResource) {
      const parsed = parseTextResource(rel, text);
      if (parsed.uid) uidToPath[parsed.uid] = rel;
      if (isScene) {
        scenes.push({ path: rel, uid: parsed.uid, extResources: parsed.extResources, nodes: parsed.nodes, connections: parsed.connections });
      } else {
        resources.push({ path: rel, uid: parsed.uid, extResources: parsed.extResources });
      }
    } else {
      const funcs = extractFuncs(text);
      if (funcs.length > 0) scriptFuncs[rel] = funcs;
      const paths = extractNodePaths(text);
      if (paths.length > 0) scriptNodePaths[rel] = paths;
    }
  }

  // 主场景归一化
  let mainScene = config.mainScene;
  if (mainScene) {
    if (mainScene.startsWith("uid://")) mainScene = uidToPath[mainScene] ?? mainScene;
    else if (mainScene.startsWith("res://")) mainScene = mainScene.slice("res://".length);
  }

  const autoloads = config.autoloads.map((a) => ({
    name: a.name,
    path: a.path.startsWith("res://") ? a.path.slice("res://".length) : a.path,
  }));

  const ir: IRDocument = {
    schemaVersion: 4,
    engine: "godot",
    system: {
      title: path.basename(dir),
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
    godot: {
      mainScene,
      autoloads,
      files,
      uidToPath,
      scenes,
      resources,
      scriptFuncs,
      scriptNodePaths,
    },
  };

  const universe = universeFromIR(ir);
  universe.assetFiles = new Set(files);
  universe.assetFilesLower = new Set(files.map((f) => f.toLowerCase()));

  const fingerprint = createHash("sha256")
    .update(JSON.stringify([...fileHashes.entries()].sort()))
    .digest("hex")
    .slice(0, 16);

  return { ir, universe, assets, fingerprint, fileHashes, warnings };
}
