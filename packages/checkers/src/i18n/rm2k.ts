/**
 * RM2k/2k3 检查器文案目录。
 * 键以 checker.rm2k. 开头；占位符用 {name}。import 即完成注册。
 */
import { msg, registerCatalog, type CatalogOf, type LocalizableMessage } from "@rmtest/i18n";

const zh = {
  // 位置前缀（作为消息参数传入）
  "checker.rm2k.locationEventPage": "地图 {mapId} · 事件 {eventId} {name} · 页 {page}",
  "checker.rm2k.locationCommonEvent": "公共事件 {id} {name}",
  "checker.rm2k.locationPageCondition": "{where} 页条件",
  // 传送/起始位置
  "checker.rm2k.teleportMissingTarget": "{where}：传送到地图 {mapId}，该地图不在地图树中",
  "checker.rm2k.teleportTargetNotMap": "{where}：传送到地图 {mapId}（{name}），其类型不是地图（区域/根）",
  "checker.rm2k.teleportOutOfBounds": "{where}：传送到地图 {mapId} 的 ({x}, {y})，超出边界 {width}×{height}",
  "checker.rm2k.startMapNotInTree": "起始地图 {mapId} 不在地图树中，游戏无法启动",
  "checker.rm2k.startPositionOutOfBounds": "起始位置 ({x}, {y}) 超出地图 {mapId} 边界 {width}×{height}",
  // 引用越界
  "checker.rm2k.switchOutOfRange": "{where}：引用开关 {id}，超出范围 1..{count}",
  "checker.rm2k.variableOutOfRange": "{where}：引用变量 {id}，超出范围 1..{count}",
  "checker.rm2k.commonEventMissing": "{where}：调用公共事件 {id}，不存在",
  "checker.rm2k.localEventMissing": "{where}：调用事件 {id}，不在本地图内",
  "checker.rm2k.moveEventMissing": "{where}：移动事件 {id}，不在本地图内",
  "checker.rm2k.tilesetMissing": "{where}：切换图块集 {id}，不存在",
  "checker.rm2k.battleAnimationMissing": "{where}：战斗动画 {id} 不存在",
  // 地图树完整性
  "checker.rm2k.duplicateTreeEntry": "地图 {id} 在地图树中出现多次",
  "checker.rm2k.treeEntryMissingMapFile": "地图树登记了地图 {id}（{name}）但缺少对应 {file}",
  "checker.rm2k.mapFileNotInTree": "地图 {id} 有 Map 文件但不在地图树中，游戏中无法到达",
  "checker.rm2k.parentChainBroken":
    "地图 {id}（{name}）的父链不连通（悬空父节点或循环），编辑器树中将不可见",
  // 素材缺失
  "checker.rm2k.assetMissing": "{where}：{dir} 素材 {name} 缺失",
  "checker.rm2k.parallaxMissing": "地图 {id}：全景图 {name} 缺失",
  "checker.rm2k.charsetMissing": "地图 {id} · 事件 {eventId} {name}：行走图 {charset} 缺失",
  "checker.rm2k.mapMusicMissing": "地图 {id}（{name}）：音乐 {music} 缺失",
  "checker.rm2k.mapBackgroundMissing": "地图 {id}（{name}）：背景 {background} 缺失",
  // 工程级完整性
  "checker.rm2k.mapTreeEmpty": "地图树为空（RPG_RT.lmt 缺失或损坏）",
  "checker.rm2k.noMapsLoaded": "没有加载到任何 Map*.lmu",
  "checker.rm2k.mapSizeInvalid": "地图 {id} 尺寸异常 {width}×{height}（文件损坏？）",
} as const;

const ja = {
  "checker.rm2k.locationEventPage": "マップ {mapId} · イベント {eventId} {name} · ページ {page}",
  "checker.rm2k.locationCommonEvent": "コモンイベント {id} {name}",
  "checker.rm2k.locationPageCondition": "{where} ページ条件",
  "checker.rm2k.teleportMissingTarget":
    "{where}：マップ {mapId} へ場所移動しますが、そのマップはマップツリーにありません",
  "checker.rm2k.teleportTargetNotMap":
    "{where}：マップ {mapId}（{name}）へ場所移動しますが、種類がマップではありません（エリア/ルート）",
  "checker.rm2k.teleportOutOfBounds":
    "{where}：マップ {mapId} の ({x}, {y}) へ場所移動しますが、範囲 {width}×{height} を超えています",
  "checker.rm2k.startMapNotInTree": "開始マップ {mapId} がマップツリーにないため、ゲームを起動できません",
  "checker.rm2k.startPositionOutOfBounds":
    "開始位置 ({x}, {y}) がマップ {mapId} の範囲 {width}×{height} を超えています",
  "checker.rm2k.switchOutOfRange": "{where}：スイッチ {id} を参照していますが、範囲 1..{count} を超えています",
  "checker.rm2k.variableOutOfRange": "{where}：変数 {id} を参照していますが、範囲 1..{count} を超えています",
  "checker.rm2k.commonEventMissing": "{where}：コモンイベント {id} を呼び出していますが、存在しません",
  "checker.rm2k.localEventMissing": "{where}：イベント {id} を呼び出していますが、このマップ内にありません",
  "checker.rm2k.moveEventMissing": "{where}：イベント {id} を移動しますが、このマップ内にありません",
  "checker.rm2k.tilesetMissing": "{where}：タイルセット {id} を切り替えますが、存在しません",
  "checker.rm2k.battleAnimationMissing": "{where}：戦闘アニメーション {id} が存在しません",
  "checker.rm2k.duplicateTreeEntry": "マップ {id} がマップツリーに複数回現れます",
  "checker.rm2k.treeEntryMissingMapFile":
    "マップツリーにマップ {id}（{name}）が登録されていますが、対応する {file} がありません",
  "checker.rm2k.mapFileNotInTree":
    "マップ {id} に Map ファイルがありますがマップツリーにないため、ゲーム内で到達できません",
  "checker.rm2k.parentChainBroken":
    "マップ {id}（{name}）の親チェーンが途切れています（親ノードの欠落または循環）。エディターツリーに表示されません",
  "checker.rm2k.assetMissing": "{where}：{dir} アセット {name} が見つかりません",
  "checker.rm2k.parallaxMissing": "マップ {id}：パノラマ {name} が見つかりません",
  "checker.rm2k.charsetMissing":
    "マップ {id} · イベント {eventId} {name}：歩行グラフィック {charset} が見つかりません",
  "checker.rm2k.mapMusicMissing": "マップ {id}（{name}）：音楽 {music} が見つかりません",
  "checker.rm2k.mapBackgroundMissing": "マップ {id}（{name}）：背景 {background} が見つかりません",
  "checker.rm2k.mapTreeEmpty": "マップツリーが空です（RPG_RT.lmt の欠落または破損）",
  "checker.rm2k.noMapsLoaded": "Map*.lmu が 1 つも読み込まれていません",
  "checker.rm2k.mapSizeInvalid": "マップ {id} のサイズが異常です {width}×{height}（ファイル破損？）",
} as const;

const ko = {
  "checker.rm2k.locationEventPage": "맵 {mapId} · 이벤트 {eventId} {name} · 페이지 {page}",
  "checker.rm2k.locationCommonEvent": "커먼 이벤트 {id} {name}",
  "checker.rm2k.locationPageCondition": "{where} 페이지 조건",
  "checker.rm2k.teleportMissingTarget":
    "{where}: 맵 {mapId}(으)로 이동하지만 해당 맵이 맵 트리에 없습니다",
  "checker.rm2k.teleportTargetNotMap":
    "{where}: 맵 {mapId}({name})(으)로 이동하지만 종류가 맵이 아닙니다(영역/루트)",
  "checker.rm2k.teleportOutOfBounds":
    "{where}: 맵 {mapId}의 ({x}, {y})(으)로 이동하지만 경계 {width}×{height}를 벗어났습니다",
  "checker.rm2k.startMapNotInTree": "시작 맵 {mapId}이(가) 맵 트리에 없어 게임을 시작할 수 없습니다",
  "checker.rm2k.startPositionOutOfBounds":
    "시작 위치 ({x}, {y})가 맵 {mapId}의 경계 {width}×{height}를 벗어났습니다",
  "checker.rm2k.switchOutOfRange": "{where}: 스위치 {id}을(를) 참조하지만 범위 1..{count}를 벗어났습니다",
  "checker.rm2k.variableOutOfRange": "{where}: 변수 {id}을(를) 참조하지만 범위 1..{count}를 벗어났습니다",
  "checker.rm2k.commonEventMissing": "{where}: 커먼 이벤트 {id}을(를) 호출하지만 존재하지 않습니다",
  "checker.rm2k.localEventMissing": "{where}: 이벤트 {id}을(를) 호출하지만 이 맵 안에 없습니다",
  "checker.rm2k.moveEventMissing": "{where}: 이벤트 {id}을(를) 이동하지만 이 맵 안에 없습니다",
  "checker.rm2k.tilesetMissing": "{where}: 타일셋 {id}(으)로 전환하지만 존재하지 않습니다",
  "checker.rm2k.battleAnimationMissing": "{where}: 전투 애니메이션 {id}이(가) 존재하지 않습니다",
  "checker.rm2k.duplicateTreeEntry": "맵 {id}이(가) 맵 트리에 여러 번 나타납니다",
  "checker.rm2k.treeEntryMissingMapFile":
    "맵 트리에 맵 {id}({name})이(가) 등록되어 있지만 해당 {file}이(가) 없습니다",
  "checker.rm2k.mapFileNotInTree":
    "맵 {id}에 Map 파일이 있지만 맵 트리에 없어 게임에서 도달할 수 없습니다",
  "checker.rm2k.parentChainBroken":
    "맵 {id}({name})의 부모 체인이 끊어졌습니다(부모 노드 누락 또는 순환). 편집기 트리에서 보이지 않습니다",
  "checker.rm2k.assetMissing": "{where}: {dir} 에셋 {name}이(가) 없습니다",
  "checker.rm2k.parallaxMissing": "맵 {id}: 파노라마 {name}이(가) 없습니다",
  "checker.rm2k.charsetMissing": "맵 {id} · 이벤트 {eventId} {name}: 캐릭터 그래픽 {charset}이(가) 없습니다",
  "checker.rm2k.mapMusicMissing": "맵 {id}({name}): 음악 {music}이(가) 없습니다",
  "checker.rm2k.mapBackgroundMissing": "맵 {id}({name}): 배경 {background}이(가) 없습니다",
  "checker.rm2k.mapTreeEmpty": "맵 트리가 비어 있습니다(RPG_RT.lmt 누락 또는 손상)",
  "checker.rm2k.noMapsLoaded": "Map*.lmu이(가) 하나도 로드되지 않았습니다",
  "checker.rm2k.mapSizeInvalid": "맵 {id}의 크기가 비정상입니다 {width}×{height}(파일 손상?)",
} as const;

const en = {
  "checker.rm2k.locationEventPage": "Map {mapId} · event {eventId} {name} · page {page}",
  "checker.rm2k.locationCommonEvent": "Common event {id} {name}",
  "checker.rm2k.locationPageCondition": "{where} page condition",
  "checker.rm2k.teleportMissingTarget": "{where}: transfer to map {mapId}, which is not in the map tree",
  "checker.rm2k.teleportTargetNotMap":
    "{where}: transfer to map {mapId} ({name}), whose type is not a map (area/root)",
  "checker.rm2k.teleportOutOfBounds":
    "{where}: transfer to ({x}, {y}) on map {mapId} is outside the bounds {width}×{height}",
  "checker.rm2k.startMapNotInTree": "Start map {mapId} is not in the map tree; the game cannot start",
  "checker.rm2k.startPositionOutOfBounds":
    "Start position ({x}, {y}) is outside map {mapId} bounds {width}×{height}",
  "checker.rm2k.switchOutOfRange": "{where}: reference to switch {id} is outside the range 1..{count}",
  "checker.rm2k.variableOutOfRange": "{where}: reference to variable {id} is outside the range 1..{count}",
  "checker.rm2k.commonEventMissing": "{where}: call to common event {id}, which does not exist",
  "checker.rm2k.localEventMissing": "{where}: call to event {id}, which is not on this map",
  "checker.rm2k.moveEventMissing": "{where}: move event {id}, which is not on this map",
  "checker.rm2k.tilesetMissing": "{where}: change tileset to {id}, which does not exist",
  "checker.rm2k.battleAnimationMissing": "{where}: battle animation {id} does not exist",
  "checker.rm2k.duplicateTreeEntry": "Map {id} appears more than once in the map tree",
  "checker.rm2k.treeEntryMissingMapFile":
    "Map tree registers map {id} ({name}) but the corresponding {file} is missing",
  "checker.rm2k.mapFileNotInTree":
    "Map {id} has a Map file but is not in the map tree; unreachable in-game",
  "checker.rm2k.parentChainBroken":
    "The parent chain of map {id} ({name}) is broken (dangling parent or cycle); it will be invisible in the editor tree",
  "checker.rm2k.assetMissing": "{where}: {dir} asset {name} is missing",
  "checker.rm2k.parallaxMissing": "Map {id}: panorama {name} is missing",
  "checker.rm2k.charsetMissing": "Map {id} · event {eventId} {name}: character graphic {charset} is missing",
  "checker.rm2k.mapMusicMissing": "Map {id} ({name}): music {music} is missing",
  "checker.rm2k.mapBackgroundMissing": "Map {id} ({name}): background {background} is missing",
  "checker.rm2k.mapTreeEmpty": "Map tree is empty (RPG_RT.lmt missing or corrupted)",
  "checker.rm2k.noMapsLoaded": "No Map*.lmu files were loaded",
  "checker.rm2k.mapSizeInvalid": "Map {id} has an abnormal size {width}×{height} (corrupted file?)",
} as const;

/** 类型化消息构造：键必须存在于本引擎目录（拼错 = 编译错误），import 即完成注册 */
export function rm2k(
  key: keyof typeof zh,
  params?: Record<string, string | number | LocalizableMessage>,
): LocalizableMessage {
  return msg(key, params);
}

registerCatalog({ zh, ja, ko, en } satisfies CatalogOf<typeof zh>);
