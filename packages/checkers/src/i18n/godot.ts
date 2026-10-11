/**
 * Godot 检查器文案目录。
 * 键以 checker.godot. 开头；占位符用 {name}。import 即完成注册。
 */
import { msg, registerCatalog, type CatalogOf, type LocalizableMessage } from "@rmtest/i18n";

const zh = {
  // 位置/标签前缀（作为消息参数传入）
  "checker.godot.locationScene": "场景 {scene}",
  "checker.godot.locationSceneNode": "场景 {scene} · 节点 {node}",
  "checker.godot.locationResource": "资源 {resource}",
  "checker.godot.labelScript": "脚本",
  "checker.godot.labelExtResource": "ext_resource {type}",
  // 缺失资源
  "checker.godot.refUnresolved": "{where}：{label} uid {uid} 无法解析到文件",
  "checker.godot.refCaseMismatch": "{where}：{label} {path} 存在但大小写不一致",
  "checker.godot.refMissing": "{where}：{label} {path} 缺失",
  "checker.godot.mainSceneMissing": "主场景 {scene} 缺失",
  "checker.godot.autoloadScriptMissing": "autoload {name} 的脚本 {path} 缺失",
  // PackedScene 实例环
  "checker.godot.sceneCycle": "场景实例环：{cycle}，加载时无限递归",
  // 信号连接
  "checker.godot.connectionMethodMissing":
    "场景 {scene}：信号 {signal} 连接到 {to} 的处理函数 {method}() 未在脚本 {script} 中找到（可能由父类或内建虚方法提供）",
  // 工程配置
  "checker.godot.mainSceneNotSet": "project.godot 未设置主场景（run/main_scene），游戏无法启动",
  "checker.godot.mainSceneNotInProject": "主场景 {scene} 在工程中不存在",
  "checker.godot.autoloadScriptNotInProject": "autoload {name} 脚本 {path} 缺失，游戏启动即报错",
  // 脚本内节点路径
  "checker.godot.nodePathUnresolved":
    "场景 {scene} 节点 {node} 的脚本 {script}：get_node(\"{path}\") 解析不到节点（改名/移动后残留？）",
} as const;

const ja = {
  "checker.godot.locationScene": "シーン {scene}",
  "checker.godot.locationSceneNode": "シーン {scene} · ノード {node}",
  "checker.godot.locationResource": "リソース {resource}",
  "checker.godot.labelScript": "スクリプト",
  "checker.godot.labelExtResource": "ext_resource {type}",
  "checker.godot.refUnresolved": "{where}：{label} の uid {uid} をファイルに解決できません",
  "checker.godot.refCaseMismatch": "{where}：{label} {path} は存在しますが大文字小文字が一致しません",
  "checker.godot.refMissing": "{where}：{label} {path} が見つかりません",
  "checker.godot.mainSceneMissing": "メインシーン {scene} が見つかりません",
  "checker.godot.autoloadScriptMissing": "autoload {name} のスクリプト {path} が見つかりません",
  "checker.godot.sceneCycle": "シーンのインスタンス循環：{cycle}、読み込み時に無限再帰します",
  "checker.godot.connectionMethodMissing":
    "シーン {scene}：シグナル {signal} が {to} のハンドラ {method}() に接続されていますが、スクリプト {script} 内に見つかりません（親クラスや組み込み仮想メソッドが提供している可能性があります）",
  "checker.godot.mainSceneNotSet":
    "project.godot でメインシーン（run/main_scene）が設定されていないため、ゲームを起動できません",
  "checker.godot.mainSceneNotInProject": "メインシーン {scene} はプロジェクト内に存在しません",
  "checker.godot.autoloadScriptNotInProject":
    "autoload {name} のスクリプト {path} が見つかりません。起動時にエラーになります",
  "checker.godot.nodePathUnresolved":
    "シーン {scene} ノード {node} のスクリプト {script}：get_node(\"{path}\") のノードを解決できません（名称変更や移動後の残骸？）",
} as const;

const ko = {
  "checker.godot.locationScene": "씬 {scene}",
  "checker.godot.locationSceneNode": "씬 {scene} · 노드 {node}",
  "checker.godot.locationResource": "리소스 {resource}",
  "checker.godot.labelScript": "스크립트",
  "checker.godot.labelExtResource": "ext_resource {type}",
  "checker.godot.refUnresolved": "{where}：{label} uid {uid}을(를) 파일로 확인할 수 없습니다",
  "checker.godot.refCaseMismatch": "{where}：{label} {path}이(가) 존재하지만 대소문자가 일치하지 않습니다",
  "checker.godot.refMissing": "{where}：{label} {path}이(가) 없습니다",
  "checker.godot.mainSceneMissing": "메인 씬 {scene}이(가) 없습니다",
  "checker.godot.autoloadScriptMissing": "autoload {name}의 스크립트 {path}이(가) 없습니다",
  "checker.godot.sceneCycle": "씬 인스턴스 순환: {cycle}, 로드 시 무한 재귀합니다",
  "checker.godot.connectionMethodMissing":
    "씬 {scene}: 시그널 {signal}이(가) {to}의 핸들러 {method}()에 연결되어 있지만 스크립트 {script}에서 찾을 수 없습니다(부모 클래스나 내장 가상 메서드가 제공할 수 있음)",
  "checker.godot.mainSceneNotSet":
    "project.godot에 메인 씬(run/main_scene)이 설정되어 있지 않아 게임을 시작할 수 없습니다",
  "checker.godot.mainSceneNotInProject": "메인 씬 {scene}이(가) 프로젝트에 존재하지 않습니다",
  "checker.godot.autoloadScriptNotInProject":
    "autoload {name} 스크립트 {path}이(가) 없습니다. 게임 시작 시 오류가 발생합니다",
  "checker.godot.nodePathUnresolved":
    "씬 {scene} 노드 {node}의 스크립트 {script}: get_node(\"{path}\") 노드를 확인할 수 없습니다(이름 변경/이동 후 잔재?)",
} as const;

const en = {
  "checker.godot.locationScene": "Scene {scene}",
  "checker.godot.locationSceneNode": "Scene {scene} · node {node}",
  "checker.godot.locationResource": "Resource {resource}",
  "checker.godot.labelScript": "script",
  "checker.godot.labelExtResource": "ext_resource {type}",
  "checker.godot.refUnresolved": "{where}: {label} uid {uid} cannot be resolved to a file",
  "checker.godot.refCaseMismatch": "{where}: {label} {path} exists but the case differs",
  "checker.godot.refMissing": "{where}: {label} {path} is missing",
  "checker.godot.mainSceneMissing": "Main scene {scene} is missing",
  "checker.godot.autoloadScriptMissing": "Script {path} of autoload {name} is missing",
  "checker.godot.sceneCycle": "Scene instance cycle: {cycle}; infinite recursion on load",
  "checker.godot.connectionMethodMissing":
    "Scene {scene}: signal {signal} is connected to handler {method}() on {to}, but it was not found in script {script} (it may be provided by a parent class or a built-in virtual method)",
  "checker.godot.mainSceneNotSet": "project.godot does not set a main scene (run/main_scene); the game cannot start",
  "checker.godot.mainSceneNotInProject": "Main scene {scene} does not exist in the project",
  "checker.godot.autoloadScriptNotInProject":
    "Script {path} of autoload {name} is missing; the game will error on startup",
  "checker.godot.nodePathUnresolved":
    "Scene {scene} node {node} script {script}: get_node(\"{path}\") cannot resolve the node (leftover after a rename/move?)",
} as const;

/** 类型化消息构造：键必须存在于本引擎目录（拼错 = 编译错误），import 即完成注册 */
export function godot(key: keyof typeof zh, params?: Record<string, string | number | LocalizableMessage>): LocalizableMessage {
  return msg(key, params);
}

registerCatalog({ zh, ja, ko, en } satisfies CatalogOf<typeof zh>);
