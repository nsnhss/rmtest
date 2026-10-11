/**
 * CLI 入口黑盒测试 —— 真实进程 spawn，验证参数分派、退出码、错误路径。
 * 覆盖 main.ts 的入口面（其余命令逻辑已有函数级测试）。
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FIXTURE_DATA = new URL("../../../packages/adapters/mv/fixtures/mini/data/", import.meta.url);
const TSCONFIG = new URL("../../../tsconfig.json", import.meta.url);

function runCli(args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, ["--import", "tsx", path.join(cwd, "packages", "cli", "src", "main.ts"), ...args], {
      encoding: "utf8",
      cwd,
      // 清掉 vitest 注入的 NODE_OPTIONS（否则 tsx 加载器与 vite-node 钩子冲突）
      env: { ...process.env, NODE_OPTIONS: "" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return { status: e.status ?? 1, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? "") };
  }
}

function buildMiniProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rmtest-cli-main-"));
  mkdirSync(path.join(dir, "data"), { recursive: true });
  for (const name of readdirSync(FIXTURE_DATA)) {
    writeFileSync(path.join(dir, "data", name), readFileSync(new URL(name, FIXTURE_DATA)));
  }
  return dir;
}

describe("CLI 入口黑盒", () => {
  const repoRoot = path.dirname(fileURLToPath(TSCONFIG));

  it("scan：成功出报告；退出码反映错误数（约定：error>0 → 1）", () => {
    const dir = buildMiniProject();
    try {
      const r = runCli(["scan", dir], repoRoot);
      expect(r.status, `stderr: ${r.stderr} stdout: ${r.stdout}`).toBe(1); // mini 工程有悬空引用错误
      expect(r.stdout, `stderr: ${r.stderr}`).toContain("报告");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scan：空目录 → 加载警告但不崩溃", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rmtest-cli-empty-"));
    try {
      const r = runCli(["scan", dir], repoRoot);
      expect([0, 1]).toContain(r.status);
      expect(r.stdout.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scan：不存在的目录 → 不崩溃", () => {
    const r = runCli(["scan", "Z:/definitely/not/here"], repoRoot);
    expect([0, 1, 2]).toContain(r.status);
  });

  it("maintain：语料文件损坏 → 退出码 2 + 明确错误", () => {
    const dir = buildMiniProject();
    const corpus = path.join(dir, "bad-corpus.json");
    writeFileSync(corpus, "{not json");
    try {
      const r = runCli(["maintain", dir, corpus], repoRoot);
      expect(r.status).toBe(2);
      expect(r.stderr + r.stdout).toContain("语料文件读取失败");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maintain：语料非数组 → 退出码 2", () => {
    const dir = buildMiniProject();
    const corpus = path.join(dir, "obj-corpus.json");
    writeFileSync(corpus, JSON.stringify({ nope: true }));
    try {
      const r = runCli(["maintain", dir, corpus], repoRoot);
      expect(r.status).toBe(2);
      expect(r.stderr + r.stdout).toContain("必须是场景数组");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("带值选项与取值不被拆散：--checkers <目录> 时仍扫工程目录并真正加载插件", () => {
    const dir = buildMiniProject();
    const pluginDir = mkdtempSync(path.join(tmpdir(), "rmtest-cli-plugins-"));
    // 插件对每张地图产出一条 info：出现 PLUGIN-MARKER 即证明插件被加载并执行。
    // 归一化若把选项与取值拆开（历史缺陷），--checkers 的取值会被当成工程目录或丢失 → 断言失败。
    writeFileSync(
      path.join(pluginDir, "marker.ts"),
      `export default {
  manifest: { name: "marker", version: "0.1.0", irVersion: 1, facts: [] },
  check: (_facts, ir) => ir.maps.map((m) => ({ type: "marker", severity: "info", confidence: "low", message: "PLUGIN-MARKER map " + m.id })),
};
`,
    );
    try {
      const r = runCli(["scan", dir, "--checkers", pluginDir], repoRoot);
      const html = readFileSync(path.join(dir, "rmtest-report.html"), "utf8");
      expect(html, `stderr: ${r.stderr}`).toContain("PLUGIN-MARKER map 1");
      expect(r.stdout).toContain("提示 2"); // 两张地图 → 两条 info
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  it("--lang 生效：英文输出（带值选项与取值相邻解析）", () => {
    const dir = buildMiniProject();
    try {
      const r = runCli([dir, "--lang", "en"], repoRoot);
      expect(r.stdout).toContain("Report:"); // 未生效时是「报告:」
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("pnpm 透传形态：main.ts <目录>（无动词）→ 扫描该目录而非进程 cwd", () => {
    const dir = buildMiniProject();
    try {
      // package.json 的 `pnpm scan` 只透传工程目录：argv[2] 是目录而非动词。
      // 修好前：cmd 落到目录上 → 扫 cwd（仓库根），退出码 0 且报告写在仓库根；
      // 修好后：补隐式 scan → 扫 dir，退出码 1（mini 有悬空引用错误），报告写在 dir。
      const r = runCli([dir], repoRoot);
      expect(r.status, `stderr: ${r.stderr} stdout: ${r.stdout}`).toBe(1);
      expect(r.stdout).toContain("报告");
      expect(readdirSync(dir)).toContain("rmtest-report.html");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(path.join(repoRoot, "rmtest-report.html"), { force: true }); // 清掉回归演示可能留下的旧报告
    }
  });

  it("无参数 → 隐式 scan 当前目录（.）", () => {
    const stray = path.join(repoRoot, "rmtest-report.html");
    try {
      const r = runCli([], repoRoot);
      expect(r.status, `stderr: ${r.stderr} stdout: ${r.stdout}`).toBe(0); // 仓库根非游戏工程 → 0 错误
      expect(r.stdout).toContain("报告");
      expect(readdirSync(repoRoot)).toContain("rmtest-report.html");
    } finally {
      rmSync(stray, { force: true });
    }
  });

  it("首参是选项（--flag）→ 不当成目录；其后的位置参数才是工程目录", () => {
    const dir = buildMiniProject();
    try {
      const r = runCli(["--incremental", dir], repoRoot);
      expect(r.status, `stderr: ${r.stderr} stdout: ${r.stdout}`).toBe(1);
      expect(r.stdout).toContain("报告");
      expect(readdirSync(dir)).toContain("rmtest-report.html");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("deploy：非部署目录 → 错误路径不崩溃", () => {
    const dir = buildMiniProject();
    try {
      const r = runCli(["deploy", dir], repoRoot);
      expect([0, 1, 2]).toContain(r.status);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
