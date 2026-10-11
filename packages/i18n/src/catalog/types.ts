import type { Locale } from "../locale.ts";

/** 单个语言的键值表 */
export type Catalog = Record<string, string>;

/**
 * 以 zh 表为键的权威定义：ja/ko/en 必须键完全一致，缺译或多余键在编译期报错。
 * 用法：`const zh = {...} as const; export const xCatalog: CatalogOf<typeof zh> = { zh, ja, ko, en };`
 */
export type CatalogOf<T extends Record<string, string>> = Record<Locale, Record<keyof T, string>>;
