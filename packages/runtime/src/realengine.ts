/**
 * 真实引擎桥 —— 加载真实 MV/MZ 工程（用户自有），在真实 Game_Interpreter 上驱动。
 *
 * 与 stub 的区别：stub 验证"机制"，本桥验证"保真"——真实 DataManager、
 * 真实 $gameSwitches/$gameVariables/$gamePlayer、真实命令语义。
 * 引擎文件（rpg_*.js）是 KADOKAWA 版权物，不进仓库；测试用环境变量
 * RM_REAL_PROJECT 指向本机工程，缺失时跳过。
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connect, type Browser, type Page } from "puppeteer-core";
import { closeCdp, launchElectron, type CdpSession } from "./cdp.ts";

export interface RealGameSession extends CdpSession {
  page: Page;
}

export interface RealSnapshot {
  ready: boolean;
  switches: Array<number | null>;
  variables: Array<number | null>;
  transferring: boolean;
  transferTarget: { mapId: number; x: number; y: number } | null;
}

const BRIDGE = `(() => {
  if (window.__rmtestReal) return "exists";
  window.__rmtestReal = {
    ready() {
      return typeof DataManager !== "undefined" && DataManager.isDatabaseLoaded()
        && typeof SceneManager !== "undefined" && !SceneManager.isSceneChanging();
    },
    setupNewGame() {
      DataManager.setupNewGame();
      // 引擎自带的开局传送（系统起始点）是启动流程，不是被测命令的效果；
      // 清掉它保证测试前置状态确定。
      $gamePlayer._transferring = false;
      $gamePlayer._newMapId = 0;
      $gamePlayer._newX = 0;
      $gamePlayer._newY = 0;
    },
    async runEvent(list) {
      // 真实引擎语义：
      // - update() 在场景切换中跳过执行；场景切换只在游戏的帧循环里推进，
      //   同步空转会饿死事件循环 → 必须异步让帧
      // - 命令进入等待（消息/传送）后 isRunning 保持 true → 区分"进入等待"
      const interp = new Game_Interpreter();
      interp.setup(list, 1);
      const deadline = Date.now() + 15000;
      for (;;) {
        if (!interp.isRunning()) return "finished";
        if (interp._waitMode) return "waiting";
        if (Date.now() > deadline) return "timeout";
        interp.update();
        await new Promise((r) => setTimeout(r, 0)); // 让出事件循环，允许游戏帧推进
      }
    },
    snapshot() {
      return {
        ready: DataManager.isDatabaseLoaded(),
        switches: [1,2,3,4,5].map((i) => ($gameSwitches.value(i) ? 1 : 0)),
        variables: [1,2,3].map((i) => $gameVariables.value(i)),
        transferring: $gamePlayer.isTransferring(),
        transferTarget: $gamePlayer.isTransferring()
          ? { mapId: $gamePlayer._newMapId, x: $gamePlayer._newX, y: $gamePlayer._newY }
          : null,
      };
    },
  };
  return "injected";
})()`;

export interface RealGameOptions {
  electronPath: string;
  port?: number;
  timeoutMs?: number;
}

export async function launchRealGame(projectDir: string, opts: RealGameOptions): Promise<RealGameSession> {
  const appDir = path.resolve(import.meta.dirname, "../spike/app");
  const gameUrl = pathToFileURL(path.join(projectDir, "index.html")).href;
  const port = opts.port ?? 9600 + Math.floor(Math.random() * 300);

  const session = await launchElectron((url) => connect({ browserURL: url, defaultViewport: null }) as Promise<unknown>, {
    electronPath: opts.electronPath,
    appDir,
    port,
    timeoutMs: opts.timeoutMs,
    env: { RM_GAME_URL: gameUrl },
  });
  const proc = session.proc;
  const browser = session.browser as Browser;

  // 找到游戏页（真实工程页面 URL 是 index.html）
  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
  let page: Page | undefined;
  while (Date.now() < deadline) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes("index.html"));
    if (page) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!page) {
    proc.kill();
    throw new Error("游戏页面未就绪");
  }

  // 注入桥（幂等）
  await page.evaluate(BRIDGE);
  return { browser, proc, port, page };
}

/** 轮询等待数据库加载完成（游戏启动） */
export async function waitGameReady(page: Page, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ready = (await page.evaluate(() => (window as never as { __rmtestReal?: { ready: () => boolean } }).__rmtestReal?.ready() ?? false)) as boolean;
    if (ready) return;
    if (Date.now() > deadline) throw new Error("游戏数据加载超时");
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** 在真实引擎上执行事件命令序列并取快照 */
export async function runRealEvent(
  page: Page,
  list: unknown[],
): Promise<{ status: "finished" | "waiting" | "timeout"; snapshot: RealSnapshot }> {
  const result = (await page.evaluate(async (commands) => {
    const bridge = (window as never as { __rmtestReal: { runEvent: (l: unknown[]) => Promise<string>; snapshot: () => unknown } }).__rmtestReal;
    const status = await bridge.runEvent(commands);
    return { status, snapshot: bridge.snapshot() };
  }, list)) as { status: "finished" | "waiting" | "timeout"; snapshot: RealSnapshot };
  return result;
}

export async function closeRealGame(session: RealGameSession): Promise<void> {
  await closeCdp(session, async (b) => {
    try {
      await (b as Browser).close();
    } catch {
      // 已断连
    }
  });
}
