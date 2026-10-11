/**
 * TyranoScript 检查器文案目录。
 * 键以 checker.tyrano. 开头；占位符用 {name}。import 即完成注册。
 */
import { msg, registerCatalog, type CatalogOf, type LocalizableMessage } from "@rmtest/i18n";

const zh = {
  "checker.tyrano.brokenJumpMissingScenario":
    "场景 {file} 标签 *{label} 第 {line} 行：{kind} 的目标场景 {targetFile} 不存在",
  "checker.tyrano.brokenJumpMissingLabel":
    "场景 {file} 标签 *{label} 第 {line} 行：{kind} 的目标标签 *{target}（场景 {targetFile}）不存在",
  "checker.tyrano.assetCaseMismatch":
    "场景 {file} 标签 *{label} 第 {line} 行：{kind} 资源 {storage} 存在但大小写不一致",
  "checker.tyrano.assetMissing": "场景 {file} 标签 *{label} 第 {line} 行：{kind} 资源 {storage} 缺失",
  "checker.tyrano.selfLoop": "场景 {file} 标签 *{label} 第 {line} 行：无条件跳回自身 → 死循环",
  "checker.tyrano.entryScenarioMissing": "入口场景 {entryScenario} 缺失，游戏无法启动",
  "checker.tyrano.unreachableLabel":
    "场景 {file} 标签 *{label} 无任何静态跳转指向（动态跳转或 iscript 可达则忽略）",
  "checker.tyrano.syntaxError": "场景 {file} 第 {line} 行：{message}",
} as const;

const ja = {
  "checker.tyrano.brokenJumpMissingScenario":
    "シナリオ {file} ラベル *{label} 第 {line} 行：{kind} の対象シナリオ {targetFile} が存在しません",
  "checker.tyrano.brokenJumpMissingLabel":
    "シナリオ {file} ラベル *{label} 第 {line} 行：{kind} の対象ラベル *{target}（シナリオ {targetFile}）が存在しません",
  "checker.tyrano.assetCaseMismatch":
    "シナリオ {file} ラベル *{label} 第 {line} 行：{kind} アセット {storage} は存在しますが大文字小文字が一致しません",
  "checker.tyrano.assetMissing":
    "シナリオ {file} ラベル *{label} 第 {line} 行：{kind} アセット {storage} が見つかりません",
  "checker.tyrano.selfLoop": "シナリオ {file} ラベル *{label} 第 {line} 行：無条件に自身へ戻る → 無限ループ",
  "checker.tyrano.entryScenarioMissing":
    "開始シナリオ {entryScenario} が見つからないため、ゲームを起動できません",
  "checker.tyrano.unreachableLabel":
    "シナリオ {file} ラベル *{label} を指す静的ジャンプがありません（動的ジャンプや iscript で到達可能なら無視）",
  "checker.tyrano.syntaxError": "シナリオ {file} 第 {line} 行：{message}",
} as const;

const ko = {
  "checker.tyrano.brokenJumpMissingScenario":
    "시나리오 {file} 라벨 *{label} {line}행: {kind}의 대상 시나리오 {targetFile}이(가) 존재하지 않습니다",
  "checker.tyrano.brokenJumpMissingLabel":
    "시나리오 {file} 라벨 *{label} {line}행: {kind}의 대상 라벨 *{target}(시나리오 {targetFile})이(가) 존재하지 않습니다",
  "checker.tyrano.assetCaseMismatch":
    "시나리오 {file} 라벨 *{label} {line}행: {kind} 에셋 {storage}이(가) 존재하지만 대소문자가 일치하지 않습니다",
  "checker.tyrano.assetMissing":
    "시나리오 {file} 라벨 *{label} {line}행: {kind} 에셋 {storage}이(가) 없습니다",
  "checker.tyrano.selfLoop": "시나리오 {file} 라벨 *{label} {line}행: 무조건 자신으로 점프 → 무한 루프",
  "checker.tyrano.entryScenarioMissing":
    "시작 시나리오 {entryScenario}이(가) 없어 게임을 시작할 수 없습니다",
  "checker.tyrano.unreachableLabel":
    "시나리오 {file} 라벨 *{label}을(를) 가리키는 정적 점프가 없습니다(동적 점프나 iscript로 도달 가능하면 무시)",
  "checker.tyrano.syntaxError": "시나리오 {file} {line}행: {message}",
} as const;

const en = {
  "checker.tyrano.brokenJumpMissingScenario":
    "Scenario {file} label *{label} line {line}: target scenario {targetFile} of {kind} does not exist",
  "checker.tyrano.brokenJumpMissingLabel":
    "Scenario {file} label *{label} line {line}: target label *{target} (scenario {targetFile}) of {kind} does not exist",
  "checker.tyrano.assetCaseMismatch":
    "Scenario {file} label *{label} line {line}: {kind} asset {storage} exists but the case differs",
  "checker.tyrano.assetMissing": "Scenario {file} label *{label} line {line}: {kind} asset {storage} is missing",
  "checker.tyrano.selfLoop":
    "Scenario {file} label *{label} line {line}: unconditional jump back to itself → infinite loop",
  "checker.tyrano.entryScenarioMissing": "Entry scenario {entryScenario} is missing; the game cannot start",
  "checker.tyrano.unreachableLabel":
    "Scenario {file} label *{label} has no static jump pointing to it (ignore if reachable via dynamic jump or iscript)",
  "checker.tyrano.syntaxError": "Scenario {file} line {line}: {message}",
} as const;

/** 类型化消息构造：键必须存在于本引擎目录（拼错 = 编译错误），import 即完成注册 */
export function tyrano(key: keyof typeof zh, params?: Record<string, string | number>): LocalizableMessage {
  return msg(key, params);
}

registerCatalog({ zh, ja, ko, en } satisfies CatalogOf<typeof zh>);
