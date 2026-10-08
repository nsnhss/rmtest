/**
 * 截图检查点 —— 渲染帧的客观坏判定（全黑/全白/解码失败）。
 * "看起来不对"留给 golden 对比与 AI 抽检；这里只判"客观坏"。
 */
import { PNG } from "pngjs";
import type { Page } from "puppeteer-core";

export interface ScreenshotCapture {
  tag: string;
  base64: string;
  width: number;
  height: number;
  /** 平均亮度 0-255 */
  meanLuma: number;
  allBlack: boolean;
  allWhite: boolean;
}

export interface ScreenshotOptions {
  tag?: string;
}

export async function takeScreenshot(page: Page, opts: ScreenshotOptions = {}): Promise<ScreenshotCapture> {
  const raw = await page.screenshot({ encoding: "base64" });
  const png = PNG.sync.read(Buffer.from(raw, "base64"));

  let sum = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const px = png.data;
  for (let i = 0; i < px.length; i += 4) {
    const luma = Math.round(0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!);
    sum += luma;
    if (luma < minLuma) minLuma = luma;
    if (luma > maxLuma) maxLuma = luma;
  }
  const total = px.length / 4;

  return {
    tag: opts.tag ?? "screenshot",
    base64: raw,
    width: png.width,
    height: png.height,
    meanLuma: Math.round(sum / total),
    allBlack: maxLuma < 16,
    allWhite: minLuma > 240,
  };
}
