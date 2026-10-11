/**
 * 语言与区域设置。
 * 支持四种界面语言：中文 / 日本語 / 한국어 / English。
 */
export type Locale = "zh" | "ja" | "ko" | "en";

export const LOCALES = ["zh", "ja", "ko", "en"] as const satisfies readonly Locale[];

export const DEFAULT_LOCALE: Locale = "zh";

/** 各语言的自称（选择器中不随当前语言变化） */
export const LOCALE_LABELS: Record<Locale, string> = {
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  en: "English",
};

/** 语言 → BCP 47 标签（日期/数字格式化用） */
export const BCP47: Record<Locale, string> = {
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  en: "en-US",
};

/** 常见别名（jp/kr/cn 等非标准写法） */
const ALIASES: Record<string, Locale> = {
  zh: "zh",
  cn: "zh",
  chs: "zh",
  zho: "zh",
  chi: "zh",
  ja: "ja",
  jp: "ja",
  jpn: "ja",
  ko: "ko",
  kr: "ko",
  kor: "ko",
  en: "en",
  eng: "en",
  us: "en",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** "ja-JP" / "ja_JP.UTF-8" / "jp" → Locale */
function toLocale(name: string | undefined): Locale | undefined {
  if (!name) return undefined;
  const primary = name.split(/[-_.]/)[0]?.toLowerCase() ?? "";
  return ALIASES[primary];
}

function systemLocaleCandidates(): string[] {
  const out: string[] = [];
  try {
    out.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // 无 Intl 的环境（如极简运行时）忽略
  }
  if (typeof process !== "undefined" && process.env) {
    for (const key of ["LC_ALL", "LC_MESSAGES", "LANG"]) {
      const value = process.env[key];
      if (value) out.push(value);
    }
  }
  return out;
}

/**
 * 语言解析优先级：显式参数 → 环境变量 RMTEST_LANG → 系统语言 → 默认 zh。
 * 桌面端传入用户设置，CLI 传入 --lang。渲染进程没有 process 时自动跳过环境变量。
 */
export function resolveLocale(explicit?: string | null): Locale {
  const fromExplicit = toLocale(explicit ?? undefined);
  if (fromExplicit) return fromExplicit;
  if (typeof process !== "undefined" && process.env) {
    const fromEnv = toLocale(process.env["RMTEST_LANG"]);
    if (fromEnv) return fromEnv;
  }
  for (const candidate of systemLocaleCandidates()) {
    const locale = toLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

let current: Locale | null = null;

/** 设定进程内当前语言（CLI/桌面启动时设一次，供深层模块取用） */
export function setLocale(locale: Locale): void {
  current = locale;
}

/** 取当前语言：已 setLocale 则用之，否则按 resolveLocale() 推导 */
export function getLocale(): Locale {
  return current ?? resolveLocale();
}
