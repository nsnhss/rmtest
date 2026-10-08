import { readFileSync, readdirSync } from "node:fs";
import { parseData, mapFileName } from "../src/parse.ts";

// 测试直接吃磁盘 fixture，与 spike 共享同一份数据。
const dataDir = new URL("../fixtures/mini/data/", import.meta.url);

export function loadFixtureData(): Record<string, unknown> {
  const files: Record<string, unknown> = {};
  for (const f of readdirSync(dataDir)) {
    files[f] = JSON.parse(readFileSync(new URL(f, dataDir), "utf8"));
  }
  return files;
}

export { mapFileName };
