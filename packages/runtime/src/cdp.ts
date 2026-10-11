/**
 * CDP 桥：启动 Electron（自带 Chromium）+ 连接 puppeteer-core。
 * 这是动态执行层的地基 —— 后续所有"跑游戏"都走这条通道。
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

export interface CdpSession {
  browser: unknown; // puppeteer-core Browser；类型在此处保持松耦合，避免核心包依赖
  proc: ChildProcess;
  port: number;
}

export interface LaunchOptions {
  /** Electron 可执行文件路径 */
  electronPath: string;
  /** Electron 应用目录（含 main 入口） */
  appDir: string;
  port?: number;
  /** 等待页面目标就绪的超时 ms */
  timeoutMs?: number;
  /** 传给 Electron 进程的额外环境变量 */
  env?: Record<string, string>;
  /** 传给 Electron 的额外 Chromium 开关（如 CI 无 GPU 环境的 --disable-gpu） */
  extraArgs?: string[];
}

/**
 * 额外 Chromium 开关：显式 extraArgs 优先，否则取环境变量 RMTEST_ELECTRON_ARGS（空格分隔）。
 * 典型用途：无 GPU 的 CI/无头机器上 `RMTEST_ELECTRON_ARGS=--disable-gpu` 才能起窗口。
 */
function resolveExtraArgs(explicit?: string[]): string[] {
  if (explicit) return explicit;
  const raw = process.env["RMTEST_ELECTRON_ARGS"];
  return raw ? raw.split(/\s+/).filter((a) => a.length > 0) : [];
}

/**
 * 启动 Electron 并等待 CDP 页面目标可用。
 * 返回的 browser 通过 puppeteer-core 的 connect 获得；
 * 这里用 unknown 避免把 puppeteer-core 的类型耦合进公共契约。
 */
export async function launchElectron(
  connectFn: (browserURL: string) => Promise<unknown>,
  opts: LaunchOptions,
): Promise<CdpSession> {
  const port = opts.port ?? 9222;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const extraArgs = resolveExtraArgs(opts.extraArgs);
  const proc = spawn(opts.electronPath, [opts.appDir, `--remote-debugging-port=${port}`, ...extraArgs], {
    stdio: "ignore",
    env: { ...process.env, ...(opts.env ?? {}) },
  });

  const deadline = Date.now() + timeoutMs;
  const jsonUrl = `http://127.0.0.1:${port}/json/list`;
  for (;;) {
    try {
      const res = await fetch(jsonUrl);
      if (res.ok) {
        const targets = (await res.json()) as Array<{ type: string }>;
        if (targets.some((t) => t.type === "page")) break;
      }
    } catch {
      // CDP 尚未就绪，重试
    }
    if (Date.now() > deadline) {
      killTree(proc);
      throw new Error(`Electron 页面目标在 ${timeoutMs}ms 内未就绪`);
    }
    await sleep(300);
  }

  const browser = await connectFn(`http://127.0.0.1:${port}`);
  return { browser, proc, port };
}

/**
 * 终止 Electron 进程树。Windows 上 `ChildProcess.kill()` 只杀主进程，
 * 渲染/GPU 子进程残留（孤儿进程会占住调试端口、拖垮后续启动），故用 taskkill /T /F。
 */
function killTree(proc: ChildProcess): void {
  if (process.platform === "win32" && proc.pid) {
    try {
      spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // 进程可能已退出，忽略
    }
  } else {
    proc.kill();
  }
}

export async function closeCdp(session: CdpSession, browserClose?: (b: unknown) => Promise<void>): Promise<void> {
  try {
    await browserClose?.(session.browser);
  } catch {
    // 连接可能已断，忽略
  }
  killTree(session.proc);
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}
