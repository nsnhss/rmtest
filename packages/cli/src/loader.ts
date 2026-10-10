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

export type EngineKind = "mv" | "rgss" | "tyrano" | "gbs" | "godot";
export type AnyLoadedProject = MvProject | RgssProject | TyranoProject | GbsProject | GodotProject;

export function detectEngine(dir: string): EngineKind {
  const markers = [
    "Game.rvproj2",
    "Game.rvproj",
    "Game.rxproj",
    path.join("Data", "System.rvdata2"),
    path.join("Data", "System.rvdata"),
  ];
  if (markers.some((m) => existsSync(path.join(dir, m)))) return "rgss";
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
  return "mv";
}

export function loadProjectAny(dir: string): { engine: EngineKind; project: AnyLoadedProject } {
  const engine = detectEngine(dir);
  const project =
    engine === "rgss"
      ? loadRgss(dir)
      : engine === "tyrano"
        ? loadTyrano(dir)
        : engine === "gbs"
          ? loadGbs(dir)
          : engine === "godot"
            ? loadGodot(dir)
            : loadMv(dir);
  return { engine, project };
}
