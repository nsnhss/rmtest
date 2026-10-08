/**
 * Golden 基线对比 —— 同检查点截图与批准基线的像素 diff。
 * 回答"变了没有"，不回答"对不对"；回归检测的主力。
 */
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface GoldenDiff {
  tag: string;
  /** 尺寸不匹配时无法逐像素比较 */
  comparable: boolean;
  diffPixels: number;
  diffRatio: number;
}

export interface GoldenCompareOptions {
  /** diff 容差 0-1，默认 0.1（pixelmatch threshold） */
  threshold?: number;
}

export function compareGolden(
  current: { tag: string; base64: string },
  baseline: { base64: string },
  opts: GoldenCompareOptions = {},
): GoldenDiff {
  const a = PNG.sync.read(Buffer.from(baseline.base64, "base64"));
  const b = PNG.sync.read(Buffer.from(current.base64, "base64"));

  if (a.width !== b.width || a.height !== b.height) {
    return { tag: current.tag, comparable: false, diffPixels: a.width * a.height, diffRatio: 1 };
  }

  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: opts.threshold ?? 0.1,
  });
  return {
    tag: current.tag,
    comparable: true,
    diffPixels,
    diffRatio: diffPixels / (a.width * a.height),
  };
}
