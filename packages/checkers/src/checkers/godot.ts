/**
 * Godot 静态检查器。只在 IR 含 godot 段时产出报告。
 * 格式依据：godot-docs engine_details/file_formats/tscn.rst。
 */
import type { CheckerPlugin, IRGodotNode, IRGodotSection, ReportSection } from "@rmtest/core";
import type { LocalizableMessage } from "@rmtest/i18n";
import { godot } from "../i18n/godot.ts";

type GSection = IRGodotSection;

const NO_SECTIONS: ReportSection[] = [];

function sec(
  type: string,
  severity: ReportSection["severity"],
  confidence: ReportSection["confidence"],
  message: LocalizableMessage,
  evidence?: unknown,
): ReportSection {
  return {
    type,
    severity,
    confidence,
    message: message.message,
    messageId: message.messageId,
    messageParams: message.messageParams,
    evidence,
  };
}

/** ref → 工程相对路径；null = 无法解析（缺 path 且缺 uid） */
function refPath(ref: { path: string | null; uid: string | null }, uidToPath: Record<string, string>): string | null {
  if (ref.path) return ref.path;
  if (ref.uid) return uidToPath[ref.uid] ?? null;
  return null;
}

/** 资源缺失：ext_resource/实例/脚本引用 + 主场景 + autoload 的存在性 */
export const godotMissingResourceChecker: CheckerPlugin = {
  manifest: { name: "godot-missing-resource", version: "0.1.0", irVersion: 4, facts: [] },
  check(_facts, ir) {
    const t = ir.godot;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    const fileSet = new Set(t.files);
    const filesLower = new Set(t.files.map((f) => f.toLowerCase()));

    const check = (where: LocalizableMessage, ref: { path: string | null; uid: string | null }, label: LocalizableMessage) => {
      if (ref.path === null && ref.uid === null) return; // 内联/空引用
      const p = refPath(ref, t.uidToPath);
      if (p === null) {
        out.push(
          sec(
            "godot-missing-resource",
            "error",
            "high",
            godot("checker.godot.refUnresolved", { where, label, uid: ref.uid ?? "" }),
          ),
        );
        return;
      }
      if (fileSet.has(p)) return;
      if (filesLower.has(p.toLowerCase())) {
        out.push(
          sec("godot-missing-resource", "warning", "low", godot("checker.godot.refCaseMismatch", { where, label, path: p })),
        );
      } else {
        out.push(sec("godot-missing-resource", "error", "high", godot("checker.godot.refMissing", { where, label, path: p })));
      }
    };

    for (const s of t.scenes) {
      for (const ref of s.extResources) {
        check(
          godot("checker.godot.locationScene", { scene: s.path }),
          ref,
          godot("checker.godot.labelExtResource", { type: ref.type }),
        );
      }
      for (const n of s.nodes) {
        if (n.scriptRef) {
          check(
            godot("checker.godot.locationSceneNode", { scene: s.path, node: n.path }),
            n.scriptRef,
            godot("checker.godot.labelScript"),
          );
        }
      }
    }
    for (const r of t.resources) {
      for (const ref of r.extResources) {
        check(
          godot("checker.godot.locationResource", { resource: r.path }),
          ref,
          godot("checker.godot.labelExtResource", { type: ref.type }),
        );
      }
    }

    if (t.mainScene !== null) {
      if (!fileSet.has(t.mainScene)) {
        out.push(sec("godot-missing-resource", "error", "high", godot("checker.godot.mainSceneMissing", { scene: t.mainScene })));
      }
    }
    for (const a of t.autoloads) {
      if (!fileSet.has(a.path)) {
        out.push(
          sec("godot-missing-resource", "error", "high", godot("checker.godot.autoloadScriptMissing", { name: a.name, path: a.path })),
        );
      }
    }
    return out;
  },
};

/** PackedScene 实例环 → 加载时无限递归 */
export const godotSceneCycleChecker: CheckerPlugin = {
  manifest: { name: "godot-scene-cycle", version: "0.1.0", irVersion: 4, facts: [] },
  check(_facts, ir) {
    const t = ir.godot;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    const byPath = new Map(t.scenes.map((s) => [s.path, s]));

    const edges = new Map<string, string[]>();
    for (const s of t.scenes) {
      const targets = new Set<string>();
      for (const ref of s.extResources) {
        if (ref.type !== "PackedScene") continue;
        const p = refPath(ref, t.uidToPath);
        if (p && byPath.has(p)) targets.add(p);
      }
      edges.set(s.path, [...targets]);
    }

    const state = new Map<string, 0 | 1 | 2>(); // 0 未访 1 在栈 2 完成
    const stack: string[] = [];
    const reportCycle = (startIdx: number) => {
      const cycle = [...stack.slice(startIdx), stack[startIdx]!].join(" → ");
      out.push(sec("godot-scene-cycle", "error", "high", godot("checker.godot.sceneCycle", { cycle })));
    };

    const visit = (p: string): void => {
      state.set(p, 1);
      stack.push(p);
      for (const next of edges.get(p) ?? []) {
        const ns = state.get(next) ?? 0;
        if (ns === 1) {
          reportCycle(stack.indexOf(next));
        } else if (ns === 0) {
          visit(next);
        }
      }
      stack.pop();
      state.set(p, 2);
    };
    for (const p of edges.keys()) {
      if ((state.get(p) ?? 0) === 0) visit(p);
    }
    return out;
  },
};

/** 信号连接的处理函数未在目标节点脚本中定义（可能由父类/内建提供 → warning/low） */
export const godotConnectionMethodChecker: CheckerPlugin = {
  manifest: { name: "godot-connection-method", version: "0.1.0", irVersion: 4, facts: [] },
  check(_facts, ir) {
    const t = ir.godot;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];

    for (const s of t.scenes) {
      const nodesByPath = new Map(s.nodes.map((n) => [n.path, n]));
      for (const c of s.connections) {
        if (c.to.length === 0 || c.method.length === 0) continue;
        const node = nodesByPath.get(c.to);
        if (!node || !node.scriptRef) continue; // 无脚本 → 无法静态核对
        const scriptPath = refPath(node.scriptRef, t.uidToPath);
        if (!scriptPath || !scriptPath.toLowerCase().endsWith(".gd")) continue; // 内联脚本跳过
        const funcs = t.scriptFuncs[scriptPath];
        if (!funcs) continue; // 脚本不在仓库（外部插件等）
        if (!funcs.includes(c.method)) {
          out.push(
            sec(
              "godot-connection-method",
              "warning",
              "low",
              godot("checker.godot.connectionMethodMissing", {
                scene: s.path,
                signal: c.signal,
                to: c.to,
                method: c.method,
                script: scriptPath,
              }),
            ),
          );
        }
      }
    }
    return out;
  },
};

/** 工程配置：主场景未设置/缺失、autoload 缺失 */
export const godotBrokenProjectConfigChecker: CheckerPlugin = {
  manifest: { name: "godot-project-config", version: "0.1.0", irVersion: 4, facts: [] },
  check(_facts, ir) {
    const t = ir.godot;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];
    if (t.mainScene === null) {
      out.push(sec("godot-project-config", "error", "high", godot("checker.godot.mainSceneNotSet")));
    } else if (!t.files.includes(t.mainScene) && !t.files.some((f) => f.toLowerCase() === t.mainScene!.toLowerCase())) {
      out.push(sec("godot-project-config", "error", "high", godot("checker.godot.mainSceneNotInProject", { scene: t.mainScene })));
    }
    for (const a of t.autoloads) {
      if (!t.files.includes(a.path) && !t.files.some((f) => f.toLowerCase() === a.path.toLowerCase())) {
        out.push(
          sec(
            "godot-project-config",
            "error",
            "high",
            godot("checker.godot.autoloadScriptNotInProject", { name: a.name, path: a.path }),
          ),
        );
      }
    }
    return out;
  },
};

/** 脚本内字面量节点路径解析：get_node("…")/$Path 等，在挂载该脚本的场景树中逐段解析 */
export const godotNodePathChecker: CheckerPlugin = {
  manifest: { name: "godot-node-path", version: "0.1.0", irVersion: 4, facts: [] },
  check(_facts, ir) {
    const t = ir.godot;
    if (!t) return NO_SECTIONS;
    const out: ReportSection[] = [];

    // 脚本路径 → 挂载位置（场景+节点路径）
    const attachPoints = new Map<string, Array<{ scene: string; nodePath: string }>>();
    for (const s of t.scenes) {
      for (const n of s.nodes) {
        if (!n.scriptRef) continue;
        const p = refPath(n.scriptRef, t.uidToPath);
        if (p) {
          const list = attachPoints.get(p) ?? [];
          list.push({ scene: s.path, nodePath: n.path });
          attachPoints.set(p, list);
        }
      }
    }

    for (const [scriptPath, literalPaths] of Object.entries(t.scriptNodePaths)) {
      const points = attachPoints.get(scriptPath) ?? [];
      for (const { scene, nodePath } of points) {
        const sceneData = t.scenes.find((s) => s.path === scene);
        if (!sceneData) continue;
        const children = new Map<string, IRGodotNode[]>();
        for (const n of sceneData.nodes) {
          const parent = n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : ".";
          const list = children.get(parent) ?? [];
          list.push(n);
          children.set(parent, list);
        }
        const byName = (parent: string, name: string) =>
          (children.get(parent) ?? []).find((n) => n.name === name) ?? null;

        for (const raw of literalPaths) {
          // ^"X" 只是 NodePath() 构造简写，等价于 "X"（相对当前节点），不是祖先查找
          const pathStr = raw.startsWith("^") ? raw.slice(1) : raw;
          if (pathStr.length === 0 || pathStr === ".") continue;

          // 相对路径逐段解析
          const segs = pathStr.split("/").filter((s) => s.length > 0);
          let cur = nodePath;
          let unresolved = false;
          for (let i = 0; i < segs.length; i++) {
            const seg = segs[i]!;
            if (seg === "..") {
              const parent = cur.includes("/") ? cur.slice(0, cur.lastIndexOf("/")) : ".";
              if (cur === ".") {
                unresolved = true;
                break;
              }
              cur = parent;
              continue;
            }
            const parentForLookup = cur === "." ? "." : cur;
            const child = byName(parentForLookup, seg);
            if (!child) {
              unresolved = true;
              break;
            }
            if (child.instanceRefId !== null && i < segs.length - 1) {
              break; // 剩余段在实例化的子场景里，静态不可查 → 跳过不报
            }
            cur = child.path;
          }
          if (unresolved) {
            out.push(
              sec(
                "godot-node-path",
                "warning",
                "low",
                godot("checker.godot.nodePathUnresolved", {
                  scene,
                  node: nodePath,
                  script: scriptPath,
                  path: pathStr,
                }),
              ),
            );
          }
        }
      }
    }
    return out;
  },
};

export function godotCheckers(): CheckerPlugin[] {
  return [
    godotMissingResourceChecker,
    godotSceneCycleChecker,
    godotConnectionMethodChecker,
    godotBrokenProjectConfigChecker,
    godotNodePathChecker,
  ];
}
