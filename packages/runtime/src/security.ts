/**
 * 运行时加固 —— 被测试的游戏代码是第三方代码，按不可信输入对待：
 * 1. 网络封锁：只放行本地资源协议（file:/data:/about:/blob:），一切外部请求拦截。
 * 2. 写隔离：渲染进程无 nodeIntegration + sandbox，天然无文件系统访问。
 * 3. 返回拦截统计，供证据/报告使用。
 */
import type { Page } from "puppeteer-core";

export interface HardeningStats {
  blocked: string[];
}

const LOCAL_PROTOCOLS = ["file:", "data:", "about:", "blob:"];

export async function hardenPage(page: Page): Promise<HardeningStats> {
  const stats: HardeningStats = { blocked: [] };
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (LOCAL_PROTOCOLS.some((p) => url.startsWith(p))) {
      void req.continue();
      return;
    }
    stats.blocked.push(url);
    void req.abort();
  });
  return stats;
}
