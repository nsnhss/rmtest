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
  /** 索引 = 开关 ID（0 槽为 null） */
  switches: Array<boolean | null>;
  /** 索引 = 变量 ID */
  variables: Array<number | null>;
  transferring: boolean;
  transferTarget: { mapId: number; x: number; y: number } | null;
  mapId: number;
  playerX: number;
  playerY: number;
  eventRunning: boolean;
  messageBusy: boolean;
  dataMapWidth: number;
  dataMapHeight: number;
}

const BRIDGE = `(() => {
  if (window.__rmtestReal) return "exists";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__rmtestReal = {
    ready() {
      return typeof DataManager !== "undefined" && DataManager.isDatabaseLoaded()
        && typeof SceneManager !== "undefined" && !SceneManager.isSceneChanging();
    },
    setupNewGame() {
      // 保留引擎自带的开局传送：Scene_Map 靠 $gamePlayer.newMapId() 决定加载哪张地图
      DataManager.setupNewGame();
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
        await sleep(0); // 让出事件循环，允许游戏帧推进
      }
    },
    // —— 场景级：进入地图、触发事件、模拟按键、存档 ——
    async enterMapScene() {
      SceneManager.goto(Scene_Map);
      const deadline = Date.now() + 20000;
      while (!(SceneManager._scene && SceneManager._scene.constructor === Scene_Map
          && typeof $gameMap !== "undefined" && $gameMap._mapId > 0
          && !SceneManager.isSceneChanging())) {
        if (Date.now() > deadline) return false;
        await sleep(30);
      }
      return true;
    },
    async gotoMap() {
      this.setupNewGame();
      return this.enterMapScene();
    },
    setPlayer(x, y) { $gamePlayer.locate(x, y); },
    // 触发 (x,y) 处"确定键"类型的事件（真实引擎的玩家交互路径）
    triggerAt(x, y) { $gamePlayer.startMapEvent(x, y, [0], true); },
    pressOk() {
      Input._currentState["ok"] = true;
      Input._previousState["ok"] = false;
    },
    isEventRunning() { return $gameMap.isEventRunning(); },
    messageBusy() { return $gameMessage.isBusy(); },
    saveGame(slot) { return DataManager.saveGame(slot); },
    loadGame(slot) { return DataManager.loadGame(slot); },
    snapshot() {
      return {
        ready: typeof DataManager !== "undefined" && DataManager.isDatabaseLoaded(),
        switches: $gameSwitches._data,
        variables: $gameVariables._data,
        transferring: $gamePlayer.isTransferring(),
        transferTarget: $gamePlayer.isTransferring()
          ? { mapId: $gamePlayer._newMapId, x: $gamePlayer._newX, y: $gamePlayer._newY }
          : null,
        mapId: typeof $gameMap !== "undefined" ? $gameMap._mapId : 0,
        playerX: $gamePlayer._x,
        playerY: $gamePlayer._y,
        eventRunning: typeof $gameMap !== "undefined" ? $gameMap.isEventRunning() : false,
        messageBusy: $gameMessage.isBusy(),
        dataMapWidth: typeof $dataMap !== "undefined" ? $dataMap.width : 0,
        dataMapHeight: typeof $dataMap !== "undefined" ? $dataMap.height : 0,
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

// —— 场景级 Node 侧助手 ——

interface RealBridge {
  ready: () => boolean;
  setupNewGame: () => void;
  runEvent: (list: unknown[]) => Promise<"finished" | "waiting" | "timeout">;
  enterMapScene: () => Promise<boolean>;
  gotoMap: () => Promise<boolean>;
  setPlayer: (x: number, y: number) => void;
  triggerAt: (x: number, y: number) => void;
  pressOk: () => void;
  isEventRunning: () => boolean;
  messageBusy: () => boolean;
  saveGame: (slot: number) => boolean;
  loadGame: (slot: number) => boolean;
  snapshot: () => RealSnapshot;
}

type RealWindow = { __rmtestReal: RealBridge };

export async function gotoMap(page: Page): Promise<boolean> {
  return (await page.evaluate(() => (window as unknown as RealWindow).__rmtestReal.gotoMap())) as boolean;
}

export async function enterMapScene(page: Page): Promise<boolean> {
  return (await page.evaluate(() => (window as unknown as RealWindow).__rmtestReal.enterMapScene())) as boolean;
}

export async function triggerAt(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    (pos: { tx: number; ty: number }) => (window as unknown as RealWindow).__rmtestReal.triggerAt(pos.tx, pos.ty),
    { tx: x, ty: y },
  );
}

export async function pressOk(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as RealWindow).__rmtestReal.pressOk());
}

export async function saveGame(page: Page, slot: number): Promise<boolean> {
  return (await page.evaluate((s) => (window as unknown as RealWindow).__rmtestReal.saveGame(s), slot)) as boolean;
}

export async function loadGame(page: Page, slot: number): Promise<boolean> {
  return (await page.evaluate((s) => (window as unknown as RealWindow).__rmtestReal.loadGame(s), slot)) as boolean;
}

export async function snapshotReal(page: Page): Promise<RealSnapshot> {
  return (await page.evaluate(() => (window as unknown as RealWindow).__rmtestReal.snapshot())) as RealSnapshot;
}

/** 轮询快照直到条件满足或超时 */
export async function waitForSnapshot(
  page: Page,
  cond: (s: RealSnapshot) => boolean,
  timeoutMs = 15_000,
  intervalMs = 100,
): Promise<RealSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let last: RealSnapshot = await snapshotReal(page);
  while (Date.now() < deadline) {
    if (cond(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await snapshotReal(page);
  }
  return last;
}
