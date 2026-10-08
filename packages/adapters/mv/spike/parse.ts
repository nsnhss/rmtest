/**
 * P0 验证线 1：MV 数据解析 → IR。
 * 运行：pnpm spike:mv
 */
import { readFileSync, readdirSync } from "node:fs";
import { parseData } from "../src/parse.ts";

const dataDir = new URL("../fixtures/mini/data/", import.meta.url);
const files: Record<string, unknown> = {};
for (const f of readdirSync(dataDir)) {
  files[f] = JSON.parse(readFileSync(new URL(f, dataDir), "utf8"));
}

const { ir, warnings } = parseData(files);

let commands = 0;
let pages = 0;
for (const m of ir.maps) {
  for (const e of m.events) {
    pages += e.pages.length;
    for (const p of e.pages) commands += p.commands.length;
  }
}

console.log(`引擎: ${ir.engine}  schema v${ir.schemaVersion}`);
console.log(`标题: ${ir.system.title}  开局: 地图${ir.system.startMapId} (${ir.system.startX},${ir.system.startY})`);
console.log(`开关: ${ir.system.switches.length - 1} 个  变量: ${ir.system.variables.length - 1} 个`);
console.log(`地图: ${ir.maps.length}  事件: ${ir.maps.reduce((n, m) => n + m.events.length, 0)}  事件页: ${pages}  命令: ${commands}`);
console.log(`警告: ${warnings.length === 0 ? "无" : warnings.join("; ")}`);
console.log("SPIKE OK: parse");
