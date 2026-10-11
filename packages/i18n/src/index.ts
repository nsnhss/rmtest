/**
 * @rmtest/i18n —— 界面多语言（中文 / 日本語 / 한국어 / English）。
 *
 * 设计要点：
 * - 目录按命名空间自注册：内置命名空间（report / cli / ui）在此挂载，
 *   检查器各引擎组、乃至用户插件都可 `registerCatalog()` 追加自己的文案。
 * - 键集一致性由类型强制（CatalogOf）：缺译/多译在编译期报错。
 * - 可本地化消息用 `msg()` 一次产出 {messageId, messageParams, message(中文原文)}，
 *   渲染层用 `localizeMessage()` 取目标语言，键缺失时回退中文原文。
 * - 无第三方依赖；渲染进程无 process 时语言解析自动降级。
 */
import { cliCatalog } from "./catalog/cli.ts";
import { registerCatalog } from "./catalog/registry.ts";
import { reportCatalog } from "./catalog/report.ts";
import { uiCatalog } from "./catalog/ui.ts";

// 内置命名空间（检查器文案由 @rmtest/checkers 各自注册）
registerCatalog(reportCatalog);
registerCatalog(cliCatalog);
registerCatalog(uiCatalog);

export {
  LOCALES,
  LOCALE_LABELS,
  BCP47,
  DEFAULT_LOCALE,
  resolveLocale,
  isLocale,
  setLocale,
  getLocale,
  type Locale,
} from "./locale.ts";
export { lookup, localizeMessage, msg, t, type LocalizableMessage } from "./translate.ts";
export { catalogFor, catalogKeys, registerCatalog } from "./catalog/registry.ts";
export type { Catalog, CatalogOf } from "./catalog/types.ts";
