/**
 * 翻译与可本地化消息。
 *
 * 可本地化消息的契约：`message` 始终是中文原文（保证任何消费者都有可读文本），
 * `messageId` + `messageParams` 供其它语言渲染。检查器用 `msg()` 一次构造三者，
 * 避免"同一句话写两遍"的漂移。
 */
import { catalogFor } from "./catalog/registry.ts";
import { DEFAULT_LOCALE, type Locale } from "./locale.ts";

export interface LocalizableMessage {
  /** 中文原文 / 兜底文本 */
  message: string;
  /** 目录键；缺失时回退到 message */
  messageId?: string;
  /** 占位符参数；值本身也可以是可本地化消息（如 kind: 开关/変数/switch） */
  messageParams?: Record<string, string | number | LocalizableMessage>;
}

function interpolate(text: string, params?: Record<string, string | number | LocalizableMessage>, locale?: Locale): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (!(key in params)) return whole;
    const value = params[key]!;
    if (typeof value === "string" || typeof value === "number") return String(value);
    return localizeMessage(value, locale ?? DEFAULT_LOCALE);
  });
}

/** 查表：目标语言缺失时回退中文 */
export function lookup(locale: Locale, id: string): string | undefined {
  return catalogFor(locale)[id] ?? catalogFor(DEFAULT_LOCALE)[id];
}

/** 取译文；键不存在时返回键本身（便于发现漏译） */
export function t(locale: Locale, id: string, params?: Record<string, string | number | LocalizableMessage>): string {
  const text = lookup(locale, id);
  return text === undefined ? id : interpolate(text, params, locale);
}

/** 构造可本地化消息（message 固定为中文原文） */
export function msg(id: string, params?: Record<string, string | number | LocalizableMessage>): LocalizableMessage {
  return { messageId: id, messageParams: params, message: t(DEFAULT_LOCALE, id, params) };
}

/** 按语言渲染消息；无 messageId 或键缺失时回退到消息自带的原文 */
export function localizeMessage(m: LocalizableMessage, locale: Locale): string {
  if (!m.messageId) return m.message;
  const text = lookup(locale, m.messageId);
  return text === undefined ? m.message : interpolate(text, m.messageParams, locale);
}
