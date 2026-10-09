/**
 * CLI golden —— 真实引擎截图的基线审批与回归对比。
 * approve: 当前画面批准为基线（存 <工程>/rmtest.db）
 * check:   当前画面 vs 基线像素 diff；diffRatio 超阈值即失败
 */
import path from "node:path";
import { detectEngine } from "./loader.ts";
import {
  closeRealGame,
  compareGolden,
  gotoMap,
  launchRealGame,
  pageAsHandle,
  takeScreenshot,
  waitGameReady,
} from "@rmtest/runtime";
import { ProjectStore } from "@rmtest/store";

export interface GoldenCheckResult {
  tag: string;
  comparable: boolean;
  diffRatio: number;
  baselineExisted: boolean;
}

function dbPath(projectDir: string): string {
  return path.join(projectDir, "rmtest.db");
}

export async function goldenCli(
  projectDir: string,
  tag: string,
  mode: "approve" | "check",
  threshold = 0.05,
): Promise<GoldenCheckResult> {
  if (detectEngine(projectDir) === "rgss") throw new Error("RGSS 动态执行未支持");
  const electronExe = path.resolve(import.meta.dirname, "../../../node_modules/electron/dist/electron.exe");
  const session = await launchRealGame(projectDir, { electronPath: electronExe });
  try {
    await waitGameReady(session.page);
    const entered = await gotoMap(pageAsHandle(session.page));
    if (!entered) throw new Error("进入地图场景失败");
    const shot = await takeScreenshot(session.page, { tag });

    const store = new ProjectStore(dbPath(projectDir));
    try {
      const baseline = store.getBaseline(tag);
      if (mode === "approve") {
        store.saveBaseline({ tag, png: shot.base64, width: shot.width, height: shot.height });
        return { tag, comparable: true, diffRatio: 0, baselineExisted: baseline !== null };
      }
      if (!baseline) throw new Error(`基线 ${tag} 不存在，先 golden approve`);
      const diff = compareGolden({ tag, base64: shot.base64 }, { base64: baseline.png });
      return { tag, comparable: diff.comparable, diffRatio: diff.diffRatio, baselineExisted: true };
    } finally {
      store.close();
    }
  } finally {
    await closeRealGame(session);
  }
}
