/**
 * GB Studio 检查器文案目录。
 * 键以 checker.gbs. 开头；占位符用 {name}。import 即完成注册。
 */
import { msg, registerCatalog, type CatalogOf, type LocalizableMessage } from "@rmtest/i18n";

const zh = {
  // 位置前缀（作为消息参数传入）
  "checker.gbs.locationScene": "场景 {scene}",
  "checker.gbs.locationActor": "场景 {scene} · 演员 {actor}",
  "checker.gbs.locationTrigger": "场景 {scene} · 触发器 {trigger}",
  "checker.gbs.locationScript": "{where} · {key}",
  "checker.gbs.locationCustomEvent": "自定义事件 {name}",
  // 断链引用（脚本事件）
  "checker.gbs.sceneRefMissing": "{where}：{command} 场景 {id} 不存在",
  "checker.gbs.spriteRefMissing": "{where}：{command} 行走图 {id} 不存在",
  "checker.gbs.musicRefMissing": "{where}：{command} 音乐 {id} 不存在",
  "checker.gbs.soundRefMissing": "{where}：{command} 音效 {id} 不存在",
  "checker.gbs.emoteRefMissing": "{where}：{command} 表情 {id} 不存在",
  "checker.gbs.fontRefMissing": "{where}：{command} 字体 {id} 不存在",
  "checker.gbs.avatarRefMissing": "{where}：{command} 头像 {id} 不存在",
  "checker.gbs.paletteRefMissing": "{where}：{command} 调色板 {id} 不存在",
  "checker.gbs.actorRefMissing": "{where}：{command} 演员 {id} 不在场景内",
  "checker.gbs.otherActorRefMissing": "{where}：{command} 参照演员 {id} 不在场景内",
  // 断链引用（场景结构）
  "checker.gbs.backgroundMissing": "{where}：背景 {id} 不存在",
  "checker.gbs.tilesetMissing": "{where}：图块集 {id} 不存在",
  "checker.gbs.paletteMissing": "{where}：调色板 {id} 不存在",
  "checker.gbs.spritePaletteMissing": "{where}：角色调色板 {id} 不存在",
  "checker.gbs.playerSpriteMissing": "{where}：玩家行走图 {id} 不存在",
  "checker.gbs.actorSpriteMissing": "{where}：行走图 {id} 不存在",
  "checker.gbs.actorPrefabMissing": "{where}：演员预制件 {id} 不存在",
  "checker.gbs.triggerPrefabMissing": "{where}：触发器预制件 {id} 不存在",
  // 起始场景
  "checker.gbs.startSceneMissing": "起始场景 {id} 不存在，游戏无法启动",
  "checker.gbs.startSceneNotSet": "起始场景 (未设置) 不存在，游戏无法启动",
  // 碰撞软锁
  "checker.gbs.startPositionSolid":
    "起始场景 {scene} 的起始位置 ({x}, {y}) 在实心瓦片上，玩家出生即卡死",
  "checker.gbs.actorSpawnSolid": "{where} 演员 {actor} 初始位置 ({x}, {y}) 在实心瓦片上",
  "checker.gbs.transferSolid":
    "{where} 脚本 {path}：{command} 传送到场景 {scene} 的 ({x}, {y})，该瓦片实心 → 软锁",
  "checker.gbs.triggerUnreachable":
    "{where} 触发器 {trigger} 从起始位置不可达（可能由传送/事件移动激活）",
  "checker.gbs.actorUnreachable": "{where} 演员 {actor} 从起始位置不可达",
  // 资产缺失
  "checker.gbs.assetCaseMismatch": "资产 {file} 存在但文件名大小写不一致",
  "checker.gbs.assetMissing": "资产 {file} 缺失",
  // 标签缺失
  "checker.gbs.labelMissing": "{where}：EVENT_GOTO_LABEL 标签 \"{label}\" 未定义",
} as const;

const ja = {
  "checker.gbs.locationScene": "シーン {scene}",
  "checker.gbs.locationActor": "シーン {scene} · アクター {actor}",
  "checker.gbs.locationTrigger": "シーン {scene} · トリガー {trigger}",
  "checker.gbs.locationScript": "{where} · {key}",
  "checker.gbs.locationCustomEvent": "カスタムイベント {name}",
  "checker.gbs.sceneRefMissing": "{where}：{command} のシーン {id} が存在しません",
  "checker.gbs.spriteRefMissing": "{where}：{command} の歩行グラフィック {id} が存在しません",
  "checker.gbs.musicRefMissing": "{where}：{command} の音楽 {id} が存在しません",
  "checker.gbs.soundRefMissing": "{where}：{command} の効果音 {id} が存在しません",
  "checker.gbs.emoteRefMissing": "{where}：{command} のエモート {id} が存在しません",
  "checker.gbs.fontRefMissing": "{where}：{command} のフォント {id} が存在しません",
  "checker.gbs.avatarRefMissing": "{where}：{command} のアバター {id} が存在しません",
  "checker.gbs.paletteRefMissing": "{where}：{command} のパレット {id} が存在しません",
  "checker.gbs.actorRefMissing": "{where}：{command} のアクター {id} がシーン内に存在しません",
  "checker.gbs.otherActorRefMissing": "{where}：{command} の参照アクター {id} がシーン内に存在しません",
  "checker.gbs.backgroundMissing": "{where}：背景 {id} が存在しません",
  "checker.gbs.tilesetMissing": "{where}：タイルセット {id} が存在しません",
  "checker.gbs.paletteMissing": "{where}：パレット {id} が存在しません",
  "checker.gbs.spritePaletteMissing": "{where}：スプライトパレット {id} が存在しません",
  "checker.gbs.playerSpriteMissing": "{where}：プレイヤーの歩行グラフィック {id} が存在しません",
  "checker.gbs.actorSpriteMissing": "{where}：歩行グラフィック {id} が存在しません",
  "checker.gbs.actorPrefabMissing": "{where}：アクタープリファブ {id} が存在しません",
  "checker.gbs.triggerPrefabMissing": "{where}：トリガープリファブ {id} が存在しません",
  "checker.gbs.startSceneMissing": "開始シーン {id} が存在しないため、ゲームを起動できません",
  "checker.gbs.startSceneNotSet": "開始シーン (未設定) が存在しないため、ゲームを起動できません",
  "checker.gbs.startPositionSolid":
    "開始シーン {scene} の開始位置 ({x}, {y}) がソリッドタイル上にあり、プレイヤーはスポーン直後に動けなくなります",
  "checker.gbs.actorSpawnSolid": "{where} アクター {actor} の初期位置 ({x}, {y}) がソリッドタイル上にあります",
  "checker.gbs.transferSolid":
    "{where} スクリプト {path}：{command} でシーン {scene} の ({x}, {y}) へ移動しますが、そのタイルはソリッド → ソフトロック",
  "checker.gbs.triggerUnreachable":
    "{where} トリガー {trigger} は開始位置から到達できません（場所移動やイベント移動で到達する可能性があります）",
  "checker.gbs.actorUnreachable": "{where} アクター {actor} は開始位置から到達できません",
  "checker.gbs.assetCaseMismatch": "アセット {file} は存在しますがファイル名の大文字小文字が一致しません",
  "checker.gbs.assetMissing": "アセット {file} が見つかりません",
  "checker.gbs.labelMissing": "{where}：EVENT_GOTO_LABEL のラベル \"{label}\" が定義されていません",
} as const;

const ko = {
  "checker.gbs.locationScene": "씬 {scene}",
  "checker.gbs.locationActor": "씬 {scene} · 액터 {actor}",
  "checker.gbs.locationTrigger": "씬 {scene} · 트리거 {trigger}",
  "checker.gbs.locationScript": "{where} · {key}",
  "checker.gbs.locationCustomEvent": "커스텀 이벤트 {name}",
  "checker.gbs.sceneRefMissing": "{where}: {command}의 씬 {id}이(가) 존재하지 않습니다",
  "checker.gbs.spriteRefMissing": "{where}: {command}의 캐릭터 그래픽 {id}이(가) 존재하지 않습니다",
  "checker.gbs.musicRefMissing": "{where}: {command}의 음악 {id}이(가) 존재하지 않습니다",
  "checker.gbs.soundRefMissing": "{where}: {command}의 효과음 {id}이(가) 존재하지 않습니다",
  "checker.gbs.emoteRefMissing": "{where}: {command}의 이모트 {id}이(가) 존재하지 않습니다",
  "checker.gbs.fontRefMissing": "{where}: {command}의 폰트 {id}이(가) 존재하지 않습니다",
  "checker.gbs.avatarRefMissing": "{where}: {command}의 아바타 {id}이(가) 존재하지 않습니다",
  "checker.gbs.paletteRefMissing": "{where}: {command}의 팔레트 {id}이(가) 존재하지 않습니다",
  "checker.gbs.actorRefMissing": "{where}: {command}의 액터 {id}이(가) 씬 안에 없습니다",
  "checker.gbs.otherActorRefMissing": "{where}: {command}의 참조 액터 {id}이(가) 씬 안에 없습니다",
  "checker.gbs.backgroundMissing": "{where}: 배경 {id}이(가) 존재하지 않습니다",
  "checker.gbs.tilesetMissing": "{where}: 타일셋 {id}이(가) 존재하지 않습니다",
  "checker.gbs.paletteMissing": "{where}: 팔레트 {id}이(가) 존재하지 않습니다",
  "checker.gbs.spritePaletteMissing": "{where}: 스프라이트 팔레트 {id}이(가) 존재하지 않습니다",
  "checker.gbs.playerSpriteMissing": "{where}: 플레이어 캐릭터 그래픽 {id}이(가) 존재하지 않습니다",
  "checker.gbs.actorSpriteMissing": "{where}: 캐릭터 그래픽 {id}이(가) 존재하지 않습니다",
  "checker.gbs.actorPrefabMissing": "{where}: 액터 프리팹 {id}이(가) 존재하지 않습니다",
  "checker.gbs.triggerPrefabMissing": "{where}: 트리거 프리팹 {id}이(가) 존재하지 않습니다",
  "checker.gbs.startSceneMissing": "시작 씬 {id}이(가) 없어 게임을 시작할 수 없습니다",
  "checker.gbs.startSceneNotSet": "시작 씬 (미설정)이(가) 없어 게임을 시작할 수 없습니다",
  "checker.gbs.startPositionSolid":
    "시작 씬 {scene}의 시작 위치 ({x}, {y})이(가) 솔리드 타일 위에 있어 플레이어가 생성되자마자 이동할 수 없습니다",
  "checker.gbs.actorSpawnSolid": "{where} 액터 {actor}의 초기 위치 ({x}, {y})이(가) 솔리드 타일 위에 있습니다",
  "checker.gbs.transferSolid":
    "{where} 스크립트 {path}: {command}로 씬 {scene}의 ({x}, {y})로 이동하지만 해당 타일이 솔리드 → 소프트락",
  "checker.gbs.triggerUnreachable":
    "{where} 트리거 {trigger}은(는) 시작 위치에서 도달할 수 없습니다(이동이나 이벤트 이동으로 도달 가능할 수 있음)",
  "checker.gbs.actorUnreachable": "{where} 액터 {actor}은(는) 시작 위치에서 도달할 수 없습니다",
  "checker.gbs.assetCaseMismatch": "에셋 {file}이(가) 존재하지만 파일 이름의 대소문자가 일치하지 않습니다",
  "checker.gbs.assetMissing": "에셋 {file}이(가) 없습니다",
  "checker.gbs.labelMissing": "{where}: EVENT_GOTO_LABEL 라벨 \"{label}\"이(가) 정의되지 않았습니다",
} as const;

const en = {
  "checker.gbs.locationScene": "Scene {scene}",
  "checker.gbs.locationActor": "Scene {scene} · actor {actor}",
  "checker.gbs.locationTrigger": "Scene {scene} · trigger {trigger}",
  "checker.gbs.locationScript": "{where} · {key}",
  "checker.gbs.locationCustomEvent": "Custom event {name}",
  "checker.gbs.sceneRefMissing": "{where}: {command} scene {id} does not exist",
  "checker.gbs.spriteRefMissing": "{where}: {command} character graphic {id} does not exist",
  "checker.gbs.musicRefMissing": "{where}: {command} music {id} does not exist",
  "checker.gbs.soundRefMissing": "{where}: {command} sound effect {id} does not exist",
  "checker.gbs.emoteRefMissing": "{where}: {command} emote {id} does not exist",
  "checker.gbs.fontRefMissing": "{where}: {command} font {id} does not exist",
  "checker.gbs.avatarRefMissing": "{where}: {command} avatar {id} does not exist",
  "checker.gbs.paletteRefMissing": "{where}: {command} palette {id} does not exist",
  "checker.gbs.actorRefMissing": "{where}: {command} actor {id} is not in the scene",
  "checker.gbs.otherActorRefMissing": "{where}: {command} reference actor {id} is not in the scene",
  "checker.gbs.backgroundMissing": "{where}: background {id} does not exist",
  "checker.gbs.tilesetMissing": "{where}: tileset {id} does not exist",
  "checker.gbs.paletteMissing": "{where}: palette {id} does not exist",
  "checker.gbs.spritePaletteMissing": "{where}: sprite palette {id} does not exist",
  "checker.gbs.playerSpriteMissing": "{where}: player character graphic {id} does not exist",
  "checker.gbs.actorSpriteMissing": "{where}: character graphic {id} does not exist",
  "checker.gbs.actorPrefabMissing": "{where}: actor prefab {id} does not exist",
  "checker.gbs.triggerPrefabMissing": "{where}: trigger prefab {id} does not exist",
  "checker.gbs.startSceneMissing": "Start scene {id} does not exist; the game cannot start",
  "checker.gbs.startSceneNotSet": "Start scene (not set) does not exist; the game cannot start",
  "checker.gbs.startPositionSolid":
    "Start position ({x}, {y}) of start scene {scene} is on a solid tile; the player is stuck right after spawning",
  "checker.gbs.actorSpawnSolid": "{where} actor {actor} initial position ({x}, {y}) is on a solid tile",
  "checker.gbs.transferSolid":
    "{where} script {path}: {command} transfers to ({x}, {y}) in scene {scene}, but that tile is solid → softlock",
  "checker.gbs.triggerUnreachable":
    "{where} trigger {trigger} is unreachable from the start position (it may be activated by a transfer or event movement)",
  "checker.gbs.actorUnreachable": "{where} actor {actor} is unreachable from the start position",
  "checker.gbs.assetCaseMismatch": "Asset {file} exists but the file name case differs",
  "checker.gbs.assetMissing": "Asset {file} is missing",
  "checker.gbs.labelMissing": "{where}: EVENT_GOTO_LABEL label \"{label}\" is not defined",
} as const;

/** 类型化消息构造：键必须存在于本引擎目录（拼错 = 编译错误），import 即完成注册 */
export function gbs(key: keyof typeof zh, params?: Record<string, string | number | LocalizableMessage>): LocalizableMessage {
  return msg(key, params);
}

registerCatalog({ zh, ja, ko, en } satisfies CatalogOf<typeof zh>);
