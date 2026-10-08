/**
 * 游戏全域 —— "存在什么"的事实集合。
 * 数据域部分由 IR 构建；资源文件部分由引擎适配器的加载器填充。
 */
import type { IRDocument } from "./ir.ts";

export interface GameUniverse {
  /** 资源相对路径（原始大小写，相对工程根） */
  assetFiles: Set<string>;
  /** 小写化路径，用于大小写敏感检查 */
  assetFilesLower: Set<string>;
  maps: Set<number>;
  switchCount: number;
  variableCount: number;
  commonEventIds: Set<number>;
  actorIds: Set<number>;
  classIds: Set<number>;
  itemIds: Set<number>;
  weaponIds: Set<number>;
  armorIds: Set<number>;
  skillIds: Set<number>;
  troopIds: Set<number>;
  enemyIds: Set<number>;
  tilesetIds: Set<number>;
  animationIds: Set<number>;
  /** IconSet 图标总数；0 = 未知（IconSet 缺失） */
  iconCount: number;
}

export function universeFromIR(ir: IRDocument): GameUniverse {
  return {
    assetFiles: new Set(),
    assetFilesLower: new Set(),
    maps: new Set(ir.maps.map((m) => m.id)),
    switchCount: ir.system.switches.length,
    variableCount: ir.system.variables.length,
    commonEventIds: new Set(ir.commonEvents.map((e) => e.id)),
    actorIds: new Set(ir.actors.map((a) => a.id)),
    classIds: new Set(ir.classes.map((c) => c.id)),
    itemIds: new Set(ir.items.map((i) => i.id)),
    weaponIds: new Set(ir.weapons.map((i) => i.id)),
    armorIds: new Set(ir.armors.map((i) => i.id)),
    skillIds: new Set(ir.skills.map((s) => s.id)),
    troopIds: new Set(ir.troops.map((t) => t.id)),
    enemyIds: new Set(ir.enemies.map((e) => e.id)),
    tilesetIds: new Set(ir.tilesets.map((t) => t.id)),
    animationIds: new Set(ir.animations.map((a) => a.id)),
    iconCount: 0,
  };
}
