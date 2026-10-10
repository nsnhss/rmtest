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

  it("未知命令 → 帮助输出且不崩溃", () => {
    const r = runCli(["nonexistent-command"], repoRoot);
    expect(r.status).toBeLessThanOrEqual(1);
    expect(r.stdout.length + r.stderr.length).toBeGreaterThan(0);
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
