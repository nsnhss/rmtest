/**
 * 资源记录 —— checkers 层对"资源清单"的结构要求。
 * 由引擎适配器的加载器提供（结构兼容即视为满足），不依赖适配器类型。
 */
export interface AssetRecord {
  relPath: string;
  width: number;
  height: number;
}
