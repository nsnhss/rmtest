/**
 * 统一工程加载 —— MV/MZ 与 RGSS（VX Ace/XP/VX）自动识别。
 * 两个加载器输出结构兼容（ir/universe/assets/fingerprint/fileHashes/warnings）。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { loadProject as loadMv, type LoadedProject as MvProject } from "@rmtest/adapter-mv";
import { loadProject as loadRgss, type LoadedProject as RgssProject } from "@rmtest/adapter-rgss";

export type EngineKind = "mv" | "rgss";
export type AnyLoadedProject = MvProject | RgssProject;

export function detectEngine(dir: string): EngineKind {
  const markers = [
    "Game.rvproj2",
    "Game.rvproj",
    "Game.rxproj",
    path.join("Data", "System.rvdata2"),
    path.join("Data", "System.rvdata"),
  ];
  if (markers.some((m) => existsSync(path.join(dir, m)))) return "rgss";
  return "mv";
}

export function loadProjectAny(dir: string): { engine: EngineKind; project: AnyLoadedProject } {
  const engine = detectEngine(dir);
  const project = engine === "rgss" ? loadRgss(dir) : loadMv(dir);
  return { engine, project };
}
