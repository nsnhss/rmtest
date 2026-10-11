/**
 * 插件加载器消息目录 —— 加载期错误也会展示给用户，故同样四语言。
 * 键以 checker.load. 开头；每条消息自含提示，不做跨语言拼接。
 */
import { msg, registerCatalog, type CatalogOf, type LocalizableMessage } from "@rmtest/i18n";

const zh = {
  "checker.load.unreadableDir": "插件目录不可读: {error}",
  "checker.load.notPlugin": "默认导出不是合法的 CheckerPlugin（需 manifest{name,version,irVersion,facts} + check 函数）",
  "checker.load.missingCheck": "缺少 check(facts, ir) 函数（需 manifest{name,version,irVersion,facts} + check 函数）",
  "checker.load.missingManifest": "缺少 manifest（需 manifest{name,version,irVersion,facts} + check 函数）",
  "checker.load.badName": "manifest.name 必须是非空字符串",
  "checker.load.badVersion": "manifest.version 必须是字符串",
  "checker.load.badIrVersion": "manifest.irVersion 必须是整数",
  "checker.load.irVersionOutOfRange":
    "manifest.irVersion={version} 超出支持范围 1..{max}（兼容闸门）；本插件已被拒绝，未参与检查",
  "checker.load.badFacts": "manifest.facts 必须是字符串数组",
  "checker.load.missingExport": "文件没有默认导出（需 export default checker）",
} as const;

const ja = {
  "checker.load.unreadableDir": "プラグインディレクトリを読み取れません: {error}",
  "checker.load.notPlugin":
    "デフォルトエクスポートが正しい CheckerPlugin ではありません（manifest{name,version,irVersion,facts} と check 関数が必要）",
  "checker.load.missingCheck":
    "check(facts, ir) 関数がありません（manifest{name,version,irVersion,facts} と check 関数が必要）",
  "checker.load.missingManifest": "manifest がありません（manifest{name,version,irVersion,facts} と check 関数が必要）",
  "checker.load.badName": "manifest.name は空でない文字列である必要があります",
  "checker.load.badVersion": "manifest.version は文字列である必要があります",
  "checker.load.badIrVersion": "manifest.irVersion は整数である必要があります",
  "checker.load.irVersionOutOfRange":
    "manifest.irVersion={version} はサポート範囲 1..{max} を超えています（互換ゲート）。このプラグインは拒否され、検査に参加しません",
  "checker.load.badFacts": "manifest.facts は文字列の配列である必要があります",
  "checker.load.missingExport": "ファイルにデフォルトエクスポートがありません（export default checker が必要）",
} as const;

const ko = {
  "checker.load.unreadableDir": "플러그인 디렉터리를 읽을 수 없습니다: {error}",
  "checker.load.notPlugin":
    "기본 내보내기가 올바른 CheckerPlugin이 아닙니다(manifest{name,version,irVersion,facts}와 check 함수 필요)",
  "checker.load.missingCheck": "check(facts, ir) 함수가 없습니다(manifest{name,version,irVersion,facts}와 check 함수 필요)",
  "checker.load.missingManifest": "manifest가 없습니다(manifest{name,version,irVersion,facts}와 check 함수 필요)",
  "checker.load.badName": "manifest.name은 비어 있지 않은 문자열이어야 합니다",
  "checker.load.badVersion": "manifest.version은 문자열이어야 합니다",
  "checker.load.badIrVersion": "manifest.irVersion은 정수여야 합니다",
  "checker.load.irVersionOutOfRange":
    "manifest.irVersion={version}이 지원 범위 1..{max}를 벗어났습니다(호환 게이트). 이 플러그인은 거부되어 검사에 참여하지 않습니다",
  "checker.load.badFacts": "manifest.facts는 문자열 배열이어야 합니다",
  "checker.load.missingExport": "파일에 기본 내보내기가 없습니다(export default checker 필요)",
} as const;

const en = {
  "checker.load.unreadableDir": "Plugin directory is unreadable: {error}",
  "checker.load.notPlugin":
    "default export is not a valid CheckerPlugin (needs manifest{name,version,irVersion,facts} + a check function)",
  "checker.load.missingCheck": "missing the check(facts, ir) function (needs manifest{name,version,irVersion,facts} + a check function)",
  "checker.load.missingManifest": "missing manifest (needs manifest{name,version,irVersion,facts} + a check function)",
  "checker.load.badName": "manifest.name must be a non-empty string",
  "checker.load.badVersion": "manifest.version must be a string",
  "checker.load.badIrVersion": "manifest.irVersion must be an integer",
  "checker.load.irVersionOutOfRange":
    "manifest.irVersion={version} is outside the supported range 1..{max} (compatibility gate); this plugin was rejected and did not run",
  "checker.load.badFacts": "manifest.facts must be an array of strings",
  "checker.load.missingExport": "file has no default export (needs export default checker)",
} as const;

/** 类型化消息构造：键必须存在于加载器目录（拼错 = 编译错误），import 即完成注册 */
export function loadMsg(key: keyof typeof zh, params?: Record<string, string | number>): LocalizableMessage {
  return msg(key, params);
}

registerCatalog({ zh, ja, ko, en } satisfies CatalogOf<typeof zh>);
