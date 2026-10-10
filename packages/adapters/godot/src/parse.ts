/**
 * Godot 4.x 文本格式解析 —— project.godot（ConfigFile）、.tscn/.escn 场景、.tres 资源、.gd 函数清单。
 * 依据：godotengine/godot-docs engine_details/file_formats/tscn.rst。
 * 只提取检查所需的子集；二进制 .res/.scn 不解析（列入文件清单，供存在性检查）。
 */
import type { IRGodotNode, IRGodotRef, IRGodotResource, IRGodotScene } from "@rmtest/core";

/* ---- 工具 ---- */

function stripComment(line: string): string {
  // ConfigFile 注释以 ; 起始（行内 ; 注释不做处理——所需键的值不含 ;）
  const t = line.trimStart();
  return t.startsWith(";") ? "" : line;
}

function unquote(v: string): string {
  const s = v.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/** 归一化 res:// 或相对路径 → 工程相对路径（/ 分隔）；null = 无法归一 */
export function normalizePath(raw: string, baseDir: string): string | null {
  let p = raw.trim();
  if (p.startsWith('"') || p.startsWith("'")) p = unquote(p);
  if (p.startsWith("uid://")) return null; // 纯 uid，由调用方查 uidToPath
  if (p.startsWith("res://")) p = p.slice("res://".length);
  else if (!p.startsWith("/")) p = `${baseDir}/${p}`;
  const segs: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      segs.pop();
      continue;
    }
    segs.push(seg);
  }
  return segs.length > 0 ? segs.join("/") : null;
}

/* ---- .gd 函数清单 ---- */

export function extractFuncs(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(/^\s*(?:static\s+)?func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)) {
    out.add(m[1]!);
  }
  return [...out];
}

/** 提取 .gd 中的字面量节点路径：get_node("…")/get_node_or_null("…")/$"…"/$Path/^"…"（^ 保留为前缀 = 祖先查找） */
export function extractNodePaths(source: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /get_node\(\s*(\^?)\s*"([^"]*)"/g,
    /get_node_or_null\(\s*(\^?)\s*"([^"]*)"/g,
    /\$\s*"([^"]*)"/g,
    /\$\s*'([^']*)'/g,
    /\$\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      const caret = m[1] === "^" ? "^" : "";
      const p = m[2] ?? m[1]!;
      if (p.startsWith("/") || p.startsWith("%")) continue; // 引擎绝对路径 / 唯一名，静态不可查
      out.add(caret + p);
    }
  }
  return [...out];
}

/* ---- project.godot ---- */

export interface GodotProjectConfig {
  mainScene: string | null;
  autoloads: Array<{ name: string; path: string }>;
}

export function parseProjectConfig(text: string): GodotProjectConfig {
  let section = "";
  let mainScene: string | null = null;
  const autoloads: Array<{ name: string; path: string }> = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    const sm = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sm) {
      section = sm[1]!.trim();
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_\/.@-]+)\s*=\s*"?([^"\r\n]*)?"?\s*$/);
    if (!kv) continue;
    const key = kv[1]!;
    const value = unquote(kv[2]!);
    if (section === "application" && key === "run/main_scene") mainScene = value;
    if (section === "autoload") {
      const path = value.startsWith("*") ? value.slice(1) : value;
      autoloads.push({ name: key, path });
    }
  }
  return { mainScene, autoloads };
}

/* ---- .tscn / .tres ---- */

interface RawExtResource {
  id: string;
  type: string;
  path: string | null;
  uid: string | null;
}

function parseHeaderAttrs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of line.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"/g)) {
    out[m[1]!] = m[2]!;
  }
  for (const m of line.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\s"\]]+)/g)) {
    if (!(m[1]! in out)) out[m[1]!] = m[2]!;
  }
  return out;
}

interface RawScene {
  headerUid: string | null;
  extResources: RawExtResource[];
  nodes: IRGodotNode[];
  connections: Array<{ signal: string; from: string; to: string; method: string }>;
}

/**
 * 解析 .tscn/.escn/.tres 文本。
 * - ext_resource 的 path 可能是 res:// 绝对路径或相对当前文件的路径；
 * - node 的 parent 为场景内路径（根节点的子节点为 "."，根节点无 parent）；
 * - instance=ExtResource(id) 标记场景实例；script = ExtResource(id) 挂脚本。
 */
export function parseTextResource(
  filePath: string, // 工程相对路径（/ 分隔）
  text: string,
): { uid: string | null; extResources: RawExtResource[]; nodes: IRGodotNode[]; connections: Array<{ signal: string; from: string; to: string; method: string }> } {
  const baseDir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
  let uid: string | null = null;
  const extResources: RawExtResource[] = [];
  const extById = new Map<string, RawExtResource>();
  const nodes: IRGodotNode[] = [];
  const connections: Array<{ signal: string; from: string; to: string; method: string }> = [];
  let lastNode: IRGodotNode | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) continue;

    if (line.startsWith("[gd_scene") || line.startsWith("[gd_resource")) {
      const attrs = parseHeaderAttrs(line);
      if (attrs["uid"]) uid = attrs["uid"];
      lastNode = null;
      continue;
    }

    if (line.startsWith("[ext_resource")) {
      const attrs = parseHeaderAttrs(line);
      const rawPath = attrs["path"] ?? null;
      const ref: RawExtResource = {
        id: attrs["id"] ?? "",
        type: attrs["type"] ?? "",
        path: rawPath !== null ? normalizePath(rawPath, baseDir) : null,
        uid: attrs["uid"] ?? null,
      };
      extResources.push(ref);
      if (ref.id) extById.set(ref.id, ref);
      lastNode = null;
      continue;
    }

    if (line.startsWith("[node")) {
      const attrs = parseHeaderAttrs(line);
      const name = attrs["name"] ?? "";
      const parent = attrs["parent"] ?? null;
      const nodePath = parent === null ? "." : parent === "." ? name : `${parent}/${name}`;
      let instanceRefId: string | null = null;
      const im = line.match(/instance\s*=\s*ExtResource\(\s*"([^"]+)"\s*\)/);
      if (im) instanceRefId = im[1]!;
      const node: IRGodotNode = { path: nodePath, name, type: attrs["type"] ?? "", instanceRefId, scriptRef: null };
      // 行内 script=ExtResource(...)（罕见）；常规形态在节点体行
      const sm = line.match(/script\s*=\s*ExtResource\(\s*"([^"]+)"\s*\)/);
      if (sm) node.scriptRef = extById.get(sm[1]!) ?? null;
      nodes.push(node);
      lastNode = node;
      continue;
    }

    if (line.startsWith("[sub_resource") || line.startsWith("[resource")) {
      lastNode = null;
      continue;
    }
    if (line.startsWith("[connection")) {
      const attrs = parseHeaderAttrs(line);
      connections.push({ signal: attrs["signal"] ?? "", from: attrs["from"] ?? "", to: attrs["to"] ?? "", method: attrs["method"] ?? "" });
      lastNode = null;
      continue;
    }
    if (line.startsWith("[")) {
      lastNode = null;
      continue;
    }

    // 节点体行：script = ExtResource("…")
    if (lastNode) {
      const sm = line.match(/^script\s*=\s*ExtResource\(\s*"([^"]+)"\s*\)\s*$/);
      if (sm) lastNode.scriptRef = extById.get(sm[1]!) ?? null;
    }
  }

  return { uid, extResources, nodes, connections };
}

export function toIRScene(path: string, raw: RawScene): IRGodotScene {
  return { path, uid: raw.headerUid, extResources: raw.extResources, nodes: raw.nodes, connections: raw.connections };
}

export function toIRResource(path: string, uid: string | null, extResources: RawExtResource[]): IRGodotResource {
  return { path, uid, extResources };
}
