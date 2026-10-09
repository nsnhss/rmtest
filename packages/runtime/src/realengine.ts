/**
 * 真实引擎桥 —— 加载真实 MV/MZ 工程（用户自有），在真实 Game_Interpreter 上驱动。
 *
 * 与 stub 的区别：stub 验证"机制"，本桥验证"保真"——真实 DataManager、
 * 真实 $gameSwitches/$gameVariables/$gamePlayer、真实命令语义。
 * 引擎文件（rpg_*.js）是 KADOKAWA 版权物，不进仓库；测试用环境变量
 * RM_REAL_PROJECT 指向本机工程，缺失时跳过。
 */
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { connect, type Browser, type Page } from "puppeteer-core";
import { closeCdp, launchElectron, type CdpSession } from "./cdp.ts";

export interface RealGameSession extends CdpSession {
  page: Page;
}

export interface RealSnapshot {
  ready: boolean;
  /** 索引 = 开关 ID（0 槽为 false） */
  switches: boolean[];
  /** 索引 = 变量 ID */
  variables: Array<number | null>;
  transferring: boolean;
  transferTarget: { mapId: number; x: number; y: number } | null;
  mapId: number;
  playerX: number;
  playerY: number;
  eventRunning: boolean;
  messageBusy: boolean;
  choiceActive: boolean;
  choiceWindowActive: boolean;
  choiceIndex: number;
  dataMapWidth: number;
  dataMapHeight: number;
}

export const REAL_BRIDGE = `(() => {
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
    pressKey(k) {
      Input._currentState[k] = true;
      Input._previousState[k] = false;
    },
    // 面向触发：先试前方一格，再试脚下（覆盖"站在事件上"与"面向事件"两种真实交互）
    triggerFront(x, y, dir) {
      const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const [dx, dy] = dirs[dir] || [0, 0];
      const fx = x + dx, fy = y + dy;
      $gamePlayer.startMapEvent(fx, fy, [0], true);
      $gamePlayer.startMapEvent(x, y, [0], true);
    },
    // 路径模拟：BFS 尊重瓦片通行性（忽略事件阻挡——事件是交互目标）
    async walkPathTo(tx, ty) {
      const startX = $gamePlayer._x, startY = $gamePlayer._y;
      const w = $gameMap.width(), h = $gameMap.height();
      const key = (x, y) => x + "," + y;
      // 方向位：1下/2左/4右/8上；checkPassage(x,y,bit) true = 该方向可进
      const dirs = [[0, -1, 8], [0, 1, 1], [-1, 0, 2], [1, 0, 4]];
      const from = new Map();
      const visited = new Set([key(startX, startY)]);
      const queue = [[startX, startY]];
      while (queue.length > 0) {
        const [cx, cy] = queue.shift();
        if (cx === tx && cy === ty) break;
        for (const [dx, dy, bit] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = key(nx, ny);
          if (visited.has(k)) continue;
          // checkPassage(x, y, bit): bit = 进入方向（2下/4左/6右/8上），true = 可进
          if (!$gameMap.checkPassage(nx, ny, bit)) continue;
          visited.add(k);
          from.set(k, key(cx, cy));
          queue.push([nx, ny]);
        }
      }
      const target = key(tx, ty);
      if (!from.has(target) && !(tx === startX && ty === startY)) return false;
      const path = [];
      let cur = target;
      while (cur !== key(startX, startY)) {
        path.push(cur);
        cur = from.get(cur);
        if (!cur) return false;
      }
      path.reverse();
      for (const cell of path) {
        const [px, py] = cell.split(",").map(Number);
        $gamePlayer.locate(px, py);
        await sleep(30);
      }
      return true;
    },
    isEventRunning() { return $gameMap.isEventRunning(); },
    messageBusy() { return $gameMessage.isBusy(); },
    saveGame(slot) { return DataManager.saveGame(slot); },
    loadGame(slot) { return DataManager.loadGame(slot); },
    snapshot() {
      return {
        ready: typeof DataManager !== "undefined" && DataManager.isDatabaseLoaded(),
        switches: (() => {
          const data = $gameSwitches._data || [];
          const count = $dataSystem ? $dataSystem.switches.length : 0;
          const out = [];
          for (let i = 0; i < count; i++) out.push(!!data[i]);
          return out;
        })(),
        variables: (() => {
          const data = $gameVariables._data || [];
          const count = $dataSystem ? $dataSystem.variables.length : 0;
          const out = [];
          for (let i = 0; i < count; i++) out.push(data[i] ?? 0);
          return out;
        })(),
        transferring: $gamePlayer.isTransferring(),
        transferTarget: $gamePlayer.isTransferring()
          ? { mapId: $gamePlayer._newMapId, x: $gamePlayer._newX, y: $gamePlayer._newY }
          : null,
        mapId: $gameMap ? $gameMap._mapId : 0,
        playerX: $gamePlayer._x,
        playerY: $gamePlayer._y,
        eventRunning: $gameMap ? $gameMap.isEventRunning() : false,
        messageBusy: $gameMessage.isBusy(),
        choiceActive: $gameMessage._choices ? $gameMessage._choices.length > 0 : false,
        choiceWindowActive: (() => {
          const win = SceneManager._scene && SceneManager._scene._messageWindow
            ? SceneManager._scene._messageWindow._choiceWindow
            : null;
          return !!win && win.active;
        })(),
        choiceIndex: (() => {
          const win = SceneManager._scene && SceneManager._scene._messageWindow
            ? SceneManager._scene._messageWindow._choiceWindow
            : null;
          return win ? win.index() : -1;
        })(),
        dataMapWidth: $dataMap ? $dataMap.width : 0,
        dataMapHeight: $dataMap ? $dataMap.height : 0,
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

/** spike 应用目录：打包（import.meta 指向 bundle）与未打包（tsx）都能正确定位运行时包 */
function runtimeAppDir(): string {
  try {
    // 解析包主入口（"./package.json" 子路径不在 exports 映射里，会抛 ERR_PACKAGE_PATH_NOT_EXPORTED）
    const require = createRequire(import.meta.url);
    const entryPath = require.resolve("@rmtest/runtime");
    return path.join(path.dirname(entryPath), "../spike/app");
  } catch {
    return path.resolve(import.meta.dirname, "../spike/app");
  }
}

export async function launchRealGame(projectDir: string, opts: RealGameOptions): Promise<RealGameSession> {
  const appDir = runtimeAppDir();
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
  await page.evaluate(REAL_BRIDGE);
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
  triggerFront: (x: number, y: number, dir: "up" | "down" | "left" | "right") => void;
  pressOk: () => void;
  pressKey: (k: string) => void;
  walkPathTo: (x: number, y: number) => Promise<boolean>;
  isEventRunning: () => boolean;
  messageBusy: () => boolean;
  saveGame: (slot: number) => boolean;
  loadGame: (slot: number) => boolean;
  snapshot: () => RealSnapshot;
}

type RealWindow = { __rmtestReal: RealBridge };

/** 游戏句柄最小接口：Puppeteer Page 与 Electron webContents 适配器都满足 */
export interface GameHandle {
  evaluate: (pageFunction: string | Function, ...args: unknown[]) => Promise<unknown>;
}

/** Puppeteer Page → GameHandle 适配（Page.evaluate 泛型签名与接口不兼容，收窄于此一处） */
export function pageAsHandle(page: Page): GameHandle {
  return {
    evaluate: (fn, ...args) => page.evaluate(fn as never, ...(args as never[])),
  };
}

export async function gotoMap(handle: GameHandle): Promise<boolean> {
  return (await handle.evaluate(() => (window as unknown as RealWindow).__rmtestReal.gotoMap())) as boolean;
}

export async function enterMapScene(handle: GameHandle): Promise<boolean> {
  return (await handle.evaluate(() => (window as unknown as RealWindow).__rmtestReal.enterMapScene())) as boolean;
}

export async function triggerAt(handle: GameHandle, x: number, y: number): Promise<void> {
  await handle.evaluate(
    (pos: { tx: number; ty: number }) => (window as unknown as RealWindow).__rmtestReal.triggerAt(pos.tx, pos.ty),
    { tx: x, ty: y },
  );
}

export async function pressOk(handle: GameHandle): Promise<void> {
  await handle.evaluate(() => (window as unknown as RealWindow).__rmtestReal.pressOk());
}

export async function pressKey(handle: GameHandle, key: string): Promise<void> {
  await handle.evaluate((k: string) => (window as unknown as RealWindow).__rmtestReal.pressKey(k), key);
}

export async function walkPathTo(handle: GameHandle, x: number, y: number): Promise<boolean> {
  return (await handle.evaluate(
    (pos: { x: number; y: number }) => (window as unknown as RealWindow).__rmtestReal.walkPathTo(pos.x, pos.y),
    { x, y },
  )) as boolean;
}

export async function triggerFront(handle: GameHandle, x: number, y: number, dir: "up" | "down" | "left" | "right"): Promise<void> {
  await handle.evaluate(
    (a: { x: number; y: number; dir: "up" | "down" | "left" | "right" }) =>
      (window as unknown as RealWindow).__rmtestReal.triggerFront(a.x, a.y, a.dir),
    { x, y, dir },
  );
}

export async function saveGame(handle: GameHandle, slot: number): Promise<boolean> {
  return (await handle.evaluate((s: number) => (window as unknown as RealWindow).__rmtestReal.saveGame(s), slot)) as boolean;
}

export async function loadGame(handle: GameHandle, slot: number): Promise<boolean> {
  return (await handle.evaluate((s: number) => (window as unknown as RealWindow).__rmtestReal.loadGame(s), slot)) as boolean;
}

export async function snapshotReal(handle: GameHandle): Promise<RealSnapshot> {
  return (await handle.evaluate(() => (window as unknown as RealWindow).__rmtestReal.snapshot())) as RealSnapshot;
}

/** 轮询快照直到条件满足或超时 */
export async function waitForSnapshot(
  handle: GameHandle,
  cond: (s: RealSnapshot) => boolean,
  timeoutMs = 15_000,
  intervalMs = 100,
): Promise<RealSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let last: RealSnapshot = await snapshotReal(handle);
  while (Date.now() < deadline) {
    if (cond(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await snapshotReal(handle);
  }
  return last;
}
