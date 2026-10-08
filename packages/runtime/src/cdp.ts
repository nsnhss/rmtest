/**
 * CDP 桥：启动 Electron（自带 Chromium）+ 连接 puppeteer-core。
 * 这是动态执行层的地基 —— 后续所有"跑游戏"都走这条通道。
 */
import { spawn, type ChildProcess } from "node:child_process";

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
  const proc = spawn(opts.electronPath, [opts.appDir, `--remote-debugging-port=${port}`], {
    stdio: "ignore",
  });

  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
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
      proc.kill();
      throw new Error(`Electron 页面目标在 ${opts.timeoutMs ?? 30_000}ms 内未就绪`);
    }
    await sleep(300);
  }

  const browser = await connectFn(`http://127.0.0.1:${port}`);
  return { browser, proc, port };
}

export async function closeCdp(session: CdpSession, browserClose?: (b: unknown) => Promise<void>): Promise<void> {
  try {
    await browserClose?.(session.browser);
  } catch {
    // 连接可能已断，忽略
  }
  session.proc.kill();
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}
