/**
 * 统一工程加载 —— MV/MZ、RGSS（VX Ace/XP/VX）、TyranoScript 与 GB Studio 自动识别。
 * 各加载器输出结构兼容（ir/universe/assets/fingerprint/fileHashes/warnings）。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { loadProject as loadMv, type LoadedProject as MvProject } from "@rmtest/adapter-mv";
import { loadProject as loadRgss, type LoadedProject as RgssProject } from "@rmtest/adapter-rgss";
import { loadProject as loadTyrano, type LoadedProject as TyranoProject } from "@rmtest/adapter-tyrano";
import { findProjectFile as findGbsProjectFile, loadProject as loadGbs, type LoadedProject as GbsProject } from "@rmtest/adapter-gbs";
import { loadProject as loadGodot, type LoadedProject as GodotProject } from "@rmtest/adapter-godot";
import { loadProject as loadRm2k, type LoadedProject as Rm2kProject } from "@rmtest/adapter-rm2k";

export type EngineKind = "mv" | "mz" | "rgss" | "tyrano" | "gbs" | "godot" | "rm2k";
export type AnyLoadedProject = MvProject | RgssProject | TyranoProject | GbsProject | GodotProject | Rm2kProject;

/** MV/MZ 编辑器工程常把游戏根放在 www/ 下；直接指向游戏根也支持 */
function resolveGameRoot(dir: string): string {
  if (existsSync(path.join(dir, "data"))) return dir;
  const www = path.join(dir, "www");
  return existsSync(path.join(www, "data")) ? www : dir;
}

/** MZ 运行时是 rmmz_*.js，MV 是 rpg_*.js（无运行时按 MV 处理） */
function detectMvFlavor(root: string): "mv" | "mz" {
  return existsSync(path.join(root, "js", "rmmz_core.js")) ? "mz" : "mv";
}

export function detectEngine(dir: string): EngineKind {
  const markers = [
    "Game.rvproj2",
    "Game.rvproj",
    "Game.rxproj",
    path.join("Data", "System.rvdata2"),
    path.join("Data", "System.rvdata"),
  ];
  if (markers.some((m) => existsSync(path.join(dir, m)))) return "rgss";
  // RM2k/2k3：RPG_RT.ldb/.lmt
  if (existsSync(path.join(dir, "RPG_RT.ldb")) || existsSync(path.join(dir, "RPG_RT.lmt"))) return "rm2k";
  // TyranoScript：系统配置或场景目录 + 运行入口
  if (
    existsSync(path.join(dir, "data", "system", "Config.tjs")) ||
    (existsSync(path.join(dir, "data", "scenario")) && existsSync(path.join(dir, "index.html")))
  ) {
    return "tyrano";
  }
  // GB Studio：project.gbsproj 或根目录单个 .gbsproj
  if (findGbsProjectFile(dir) !== null) return "gbs";
  // Godot：project.godot
  if (existsSync(path.join(dir, "project.godot"))) return "godot";
  return detectMvFlavor(resolveGameRoot(dir));
}

export function loadProjectAny(dir: string): { engine: EngineKind; project: AnyLoadedProject } {
  const engine = detectEngine(dir);
  const mvRoot = resolveGameRoot(dir);
  const project =
    engine === "rgss"
      ? loadRgss(dir)
      : engine === "tyrano"
        ? loadTyrano(dir)
        : engine === "gbs"
          ? loadGbs(dir)
          : engine === "godot"
            ? loadGodot(dir)
            : engine === "rm2k"
              ? loadRm2k(dir)
              : loadMv(mvRoot, engine === "mz" ? "mz" : "mv");
  return { engine, project };
}
