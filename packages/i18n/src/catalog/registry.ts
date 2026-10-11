/**
 * 目录注册表 —— 命名空间自注册，避免中心化清单：
 * 每个包/引擎组各自一个目录文件，import 时 `registerCatalog()` 注册；
 * 插件也可注册自己的文案（与插件生态一致）。
 */
import { LOCALES, type Locale } from "../locale.ts";

const registry: Record<Locale, Record<string, string>> = { zh: {}, ja: {}, ko: {}, en: {} };

/**
 * 注册一个命名空间：四语言键集必须一致（由 CatalogOf 在编译期保证），
 * 跨命名空间重复键视为配置错误（静默覆盖更难查）。
 */
export function registerCatalog(namespace: Record<Locale, Record<string, string>>): void {
  for (const locale of LOCALES) {
    for (const [key, text] of Object.entries(namespace[locale])) {
      if (key in registry[locale]) throw new Error(`i18n 键重复注册: ${key}（${locale}）`);
      registry[locale][key] = text;
    }
  }
}

export function catalogFor(locale: Locale): Record<string, string> {
  return registry[locale];
}

/** 供完整性测试/工具链使用 */
export function catalogKeys(locale: Locale): string[] {
  return Object.keys(registry[locale]).sort();
}
