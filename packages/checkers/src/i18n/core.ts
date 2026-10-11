/**
 * 引擎无关（MV 系）检查器文案目录。
 * 键以 checker.core. 开头；占位符用 {name}。import 即完成注册。
 * 覆盖：asset-dimension / dangling / face-index / first-run-false / font /
 *       icon-index / lifecycle / picture / reachability / text-overflow / transfer。
 *
 * 标签类参数（开关/变量、类别名、传送主体、位置描述）用嵌套消息而非裸中文，
 * 渲染层按目标语言递归本地化；zh 输出与原字面量保持逐字节一致。
 */
import type { ReportLocation } from "@rmtest/core";
import { msg, registerCatalog, type CatalogOf, type LocalizableMessage } from "@rmtest/i18n";

const zh = {
  "checker.core.assetDimensionSingleCharSheet":
    "{target}: $行走图需 3 列 × 4 行（任意格大小），实际 {width}×{height}",
  "checker.core.assetDimensionCharSheet":
    "{target}: 行走图需为 48px 格的 3×4 布局（144×192 的倍数），实际 {width}×{height}",
  "checker.core.assetDimensionFace": "{target}: 脸图需为 144px 格的整倍数，实际 {width}×{height}",
  "checker.core.danglingCaseMismatch":
    "资源 {target} 大小写不一致：磁盘上是 {actual}。Windows 下正常，部署到 Linux/移动端会缺失",
  "checker.core.danglingAsset": "缺失资源: {target}",
  "checker.core.danglingReference": "悬空引用: {category} {target} 不存在（{location}）",
  "checker.core.faceIndexOutOfRange": "脸图 {name} 共 {count} 张脸，引用了索引 {index}（越界，显示为空脸）",
  "checker.core.firstRunFalse":
    "首次触发时条件恒假：{kind} {id} 的全部写入点位于本判断之后——事件需二次触发才可能进入此分支",
  "checker.core.missingCjkFont":
    "游戏含中文/日文/韩文文本，但 fonts/ 只有 MV 默认字体（无 CJK 覆盖）——移动端/网页部署会显示方框缺字",
  "checker.core.iconIndexOutOfRange": "图标索引 {iconIndex} 越界（IconSet 共 {iconCount} 个图标）: {name}",
  "checker.core.readNeverWritten":
    "{kind} {id} 被读取但事件层从未写入 —— 条件恒为假/恒为初始值，相关分支永不触发（脚本写入不计入）",
  "checker.core.writtenNeverRead": "{kind} {id} 被写入但从未被读取 —— 死逻辑或写错了开关号（脚本读取不计入）",
  "checker.core.pictureOffscreen": "图片 #{id} 锚点 ({x}, {y}) 在屏幕外（{screenW}×{screenH}）；若为滑入动画请忽略",
  "checker.core.pictureNoErase": "事件显示图片 #{id} 但从未 Erase，事件结束后常驻屏幕；若为常驻 UI 请忽略",
  "checker.core.unreachableMap": "地图 {id} ({name}) 从开局不可达（仅传送图，不含车辆/脚本传送）",
  "checker.core.textOverflow": "对话行宽约 {width}px，窗口可用宽度约 {capacity}px，可能溢出换行异常",
  "checker.core.transferOutOfBounds": "{what}目标 ({x}, {y}) 在地图 {mapId}（{width}×{height}）外 —— 传送越界",
  "checker.core.transferBlockedTile": "{what}目标 ({x}, {y}) 是不可走格子（四向全阻挡）—— 角色卡死在墙里",
  "checker.core.transferNoEscape": "{what}点 ({x}, {y}) 四周均不可走或出界 —— 角色无法离开（软锁候选）",
  // 标签：开关 / 变量
  "checker.core.kind.switch": "开关",
  "checker.core.kind.variable": "变量",
  // 标签：传送主体
  "checker.core.what.start": "开局",
  "checker.core.what.transfer": "传送",
  // 标签：类别（dangling 类别名 + 位置 dataKey 名）
  "checker.core.category.map": "地图",
  "checker.core.category.switch": "开关",
  "checker.core.category.variable": "变量",
  "checker.core.category.commonEvent": "公共事件",
  "checker.core.category.item": "道具",
  "checker.core.category.weapon": "武器",
  "checker.core.category.armor": "防具",
  "checker.core.category.skill": "技能",
  "checker.core.category.actor": "角色",
  "checker.core.category.troop": "战斗队伍",
  "checker.core.category.enemy": "敌人",
  "checker.core.category.class": "职业",
  "checker.core.category.tileset": "图块集",
  "checker.core.category.system": "系统",
  "checker.core.category.animation": "动画",
  // 位置描述（formatLocation 的本地化替代）
  "checker.core.location": "{p0}{p1}{p2}{p3}{p4}",
  "checker.core.location.sep": " · {part}",
  "checker.core.location.unknown": "未知位置",
  "checker.core.location.map": "地图 {id}",
  "checker.core.location.event": "事件 {id}",
  "checker.core.location.page": "页 {page}",
  "checker.core.location.command": "命令 {index}",
  "checker.core.location.data": "{label} {id}",
} as const;

const ja = {
  "checker.core.assetDimensionSingleCharSheet":
    "{target}: $歩行グラフィックは 3 列 × 4 行（セルサイズは任意）である必要がありますが、実際は {width}×{height} です",
  "checker.core.assetDimensionCharSheet":
    "{target}: 歩行グラフィックは 48px セルの 3×4 レイアウト（144×192 の倍数）である必要がありますが、実際は {width}×{height} です",
  "checker.core.assetDimensionFace":
    "{target}: 顔グラフィックは 144px セルの整数倍である必要がありますが、実際は {width}×{height} です",
  "checker.core.danglingCaseMismatch":
    "アセット {target} の大文字小文字が一致しません：ディスク上は {actual} です。Windows では正常ですが、Linux/モバイルへの配備では欠落します",
  "checker.core.danglingAsset": "アセットが見つかりません: {target}",
  "checker.core.danglingReference": "参照先が存在しません: {category} {target}（{location}）",
  "checker.core.faceIndexOutOfRange":
    "顔グラフィック {name} は全 {count} 枚ですが、インデックス {index} を参照しています（範囲外、空の顔が表示されます）",
  "checker.core.firstRunFalse":
    "初回起動時に条件が常に偽です：{kind} {id} の書き込みがすべてこの判定より後にあるため、この分岐に入るにはイベントの再起動が必要です",
  "checker.core.missingCjkFont":
    "ゲームに日本語/中国語/韓国語のテキストが含まれていますが、fonts/ には MV 既定フォント（CJK 非対応）しかありません——モバイル/Web 配備では豆腐（□）になります",
  "checker.core.iconIndexOutOfRange":
    "アイコンインデックス {iconIndex} が範囲外です（IconSet は全 {iconCount} 個）: {name}",
  "checker.core.readNeverWritten":
    "{kind} {id} は読み取られていますがイベント層では一度も書き込まれていません —— 条件は常に偽/初期値となり、該当する分岐は決して発火しません（スクリプトによる書き込みは含みません）",
  "checker.core.writtenNeverRead":
    "{kind} {id} は書き込まれていますが一度も読み取られていません —— デッドロジックか、番号の書き間違いです（スクリプトによる読み取りは含みません）",
  "checker.core.pictureOffscreen":
    "ピクチャ #{id} のアンカー ({x}, {y}) が画面外です（{screenW}×{screenH}）。スライドイン演出なら無視してください",
  "checker.core.pictureNoErase":
    "イベントがピクチャ #{id} を表示しましたが一度も Erase していません。イベント終了後も画面に残ります。常駐 UI なら無視してください",
  "checker.core.unreachableMap":
    "マップ {id} ({name}) は開始地点から到達不可能です（転送グラフのみ。乗り物/スクリプト転送は含みません）",
  "checker.core.textOverflow":
    "会話行の幅は約 {width} 文字、ウィンドウ容量は約 {capacity} 文字です。はみ出して改行が崩れる可能性があります",
  "checker.core.transferOutOfBounds":
    "{what}の目標地点 ({x}, {y}) はマップ {mapId}（{width}×{height}）の外です —— 転送が範囲外です",
  "checker.core.transferBlockedTile":
    "{what}の目標地点 ({x}, {y}) は通行不可タイルです（四方向すべて通行不可）—— キャラクターが壁に埋まります",
  "checker.core.transferNoEscape":
    "{what}地点 ({x}, {y}) は四方すべて通行不可または画面外 —— キャラクターが移動できません（ソフトロック候補）",
  "checker.core.kind.switch": "スイッチ",
  "checker.core.kind.variable": "変数",
  "checker.core.what.start": "開始",
  "checker.core.what.transfer": "転送",
  "checker.core.category.map": "マップ",
  "checker.core.category.switch": "スイッチ",
  "checker.core.category.variable": "変数",
  "checker.core.category.commonEvent": "コモンイベント",
  "checker.core.category.item": "アイテム",
  "checker.core.category.weapon": "武器",
  "checker.core.category.armor": "防具",
  "checker.core.category.skill": "スキル",
  "checker.core.category.actor": "アクター",
  "checker.core.category.troop": "敵グループ",
  "checker.core.category.enemy": "敵キャラ",
  "checker.core.category.class": "職業",
  "checker.core.category.tileset": "タイルセット",
  "checker.core.category.system": "システム",
  "checker.core.category.animation": "アニメーション",
  "checker.core.location": "{p0}{p1}{p2}{p3}{p4}",
  "checker.core.location.sep": " · {part}",
  "checker.core.location.unknown": "不明な位置",
  "checker.core.location.map": "マップ {id}",
  "checker.core.location.event": "イベント {id}",
  "checker.core.location.page": "ページ {page}",
  "checker.core.location.command": "コマンド {index}",
  "checker.core.location.data": "{label} {id}",
} as const;

const ko = {
  "checker.core.assetDimensionSingleCharSheet":
    "{target}: $캐릭터 그래픽은 3열 × 4행(셀 크기 임의)이어야 합니다. 실제: {width}×{height}",
  "checker.core.assetDimensionCharSheet":
    "{target}: 캐릭터 그래픽은 48px 셀의 3×4 레이아웃(144×192의 배수)이어야 합니다. 실제: {width}×{height}",
  "checker.core.assetDimensionFace": "{target}: 얼굴 그래픽은 144px 셀의 정수 배여야 합니다. 실제: {width}×{height}",
  "checker.core.danglingCaseMismatch":
    "에셋 {target}의 대소문자가 일치하지 않습니다: 디스크에는 {actual}입니다. Windows에서는 정상이지만 Linux/모바일 배포 시 누락됩니다",
  "checker.core.danglingAsset": "에셋 누락: {target}",
  "checker.core.danglingReference": "끊어진 참조: {category} {target}이(가) 존재하지 않습니다({location})",
  "checker.core.faceIndexOutOfRange":
    "얼굴 그래픽 {name}은(는) 총 {count}장인데 인덱스 {index}을(를) 참조합니다(범위 초과, 빈 얼굴로 표시됨)",
  "checker.core.firstRunFalse":
    "최초 실행 시 조건이 항상 거짓입니다: {kind} {id}의 모든 쓰기 지점이 이 판정 이후에 있으므로 이 분기에 들어가려면 이벤트를 두 번 실행해야 합니다",
  "checker.core.missingCjkFont":
    "게임에 한국어/중국어/일본어 텍스트가 포함되어 있지만 fonts/에는 MV 기본 폰트(CJK 미지원)만 있습니다——모바일/웹 배포 시 두부(□)로 표시됩니다",
  "checker.core.iconIndexOutOfRange":
    "아이콘 인덱스 {iconIndex}이(가) 범위를 벗어났습니다(IconSet 총 {iconCount}개): {name}",
  "checker.core.readNeverWritten":
    "{kind} {id}은(는) 읽히지만 이벤트 계층에서 기록된 적이 없습니다 —— 조건이 항상 거짓/초기값이 되어 관련 분기가 절대 실행되지 않습니다(스크립트 기록 제외)",
  "checker.core.writtenNeverRead":
    "{kind} {id}은(는) 기록되지만 한 번도 읽히지 않았습니다 —— 죽은 로직이거나 번호를 잘못 지정했습니다(스크립트 읽기 제외)",
  "checker.core.pictureOffscreen":
    "그림 #{id}의 앵커 ({x}, {y})가 화면 밖입니다({screenW}×{screenH}). 슬라이드 인 연출이라면 무시하세요",
  "checker.core.pictureNoErase":
    "이벤트가 그림 #{id}을(를) 표시했지만 한 번도 Erase하지 않았습니다. 이벤트 종료 후에도 화면에 남습니다. 상시 UI라면 무시하세요",
  "checker.core.unreachableMap":
    "맵 {id} ({name})은(는) 시작 지점에서 도달 불가능합니다(이동 그래프만, 탈것/스크립트 이동 제외)",
  "checker.core.textOverflow":
    "대사 줄 너비는 약 {width}자, 창 용량은 약 {capacity}자입니다. 넘쳐서 줄바꿈이 깨질 수 있습니다",
  "checker.core.transferOutOfBounds":
    "{what} 대상 지점 ({x}, {y})이(가) 맵 {mapId}({width}×{height}) 밖입니다 —— 이동 범위 초과",
  "checker.core.transferBlockedTile":
    "{what} 대상 지점 ({x}, {y})은(는) 통행 불가 타일입니다(사방 모두 통행 불가) —— 캐릭터가 벽에 끼입니다",
  "checker.core.transferNoEscape":
    "{what} 지점 ({x}, {y})은(는) 사방 모두 통행 불가 또는 맵 밖 —— 캐릭터가 나갈 수 없습니다(소프트락 후보)",
  "checker.core.kind.switch": "스위치",
  "checker.core.kind.variable": "변수",
  "checker.core.what.start": "시작",
  "checker.core.what.transfer": "이동",
  "checker.core.category.map": "맵",
  "checker.core.category.switch": "스위치",
  "checker.core.category.variable": "변수",
  "checker.core.category.commonEvent": "커먼 이벤트",
  "checker.core.category.item": "아이템",
  "checker.core.category.weapon": "무기",
  "checker.core.category.armor": "방어구",
  "checker.core.category.skill": "스킬",
  "checker.core.category.actor": "액터",
  "checker.core.category.troop": "적 그룹",
  "checker.core.category.enemy": "적 캐릭터",
  "checker.core.category.class": "직업",
  "checker.core.category.tileset": "타일셋",
  "checker.core.category.system": "시스템",
  "checker.core.category.animation": "애니메이션",
  "checker.core.location": "{p0}{p1}{p2}{p3}{p4}",
  "checker.core.location.sep": " · {part}",
  "checker.core.location.unknown": "알 수 없는 위치",
  "checker.core.location.map": "맵 {id}",
  "checker.core.location.event": "이벤트 {id}",
  "checker.core.location.page": "페이지 {page}",
  "checker.core.location.command": "명령 {index}",
  "checker.core.location.data": "{label} {id}",
} as const;

const en = {
  "checker.core.assetDimensionSingleCharSheet":
    "{target}: $ character sheet must be a 3-column × 4-row grid (any cell size), but is {width}×{height}",
  "checker.core.assetDimensionCharSheet":
    "{target}: character sheet must use the 48px 3×4 layout (a multiple of 144×192), but is {width}×{height}",
  "checker.core.assetDimensionFace": "{target}: face graphic must be a multiple of 144px cells, but is {width}×{height}",
  "checker.core.danglingCaseMismatch":
    "Asset {target} differs in case: on disk it is {actual}. Works on Windows, but will be missing when deployed to Linux/mobile",
  "checker.core.danglingAsset": "Missing asset: {target}",
  "checker.core.danglingReference": "Dangling reference: {category} {target} does not exist ({location})",
  "checker.core.faceIndexOutOfRange":
    "Face graphic {name} has {count} faces, but index {index} is referenced (out of range; renders as a blank face)",
  "checker.core.firstRunFalse":
    "Condition is always false on first run: all writes to {kind} {id} occur after this branch — the event must run a second time to enter it",
  "checker.core.missingCjkFont":
    "The game contains Chinese/Japanese/Korean text, but fonts/ only has the MV default font (no CJK coverage) — mobile/web builds will show missing-glyph boxes",
  "checker.core.iconIndexOutOfRange": "Icon index {iconIndex} is out of range (IconSet has {iconCount} icons): {name}",
  "checker.core.readNeverWritten":
    "{kind} {id} is read but never written by events — the condition is always false/initial, so the related branches never fire (script writes excluded)",
  "checker.core.writtenNeverRead":
    "{kind} {id} is written but never read — dead logic, or the wrong number was used (script reads excluded)",
  "checker.core.pictureOffscreen":
    "Picture #{id} anchor ({x}, {y}) is off-screen ({screenW}×{screenH}); ignore this if it is a slide-in animation",
  "checker.core.pictureNoErase":
    "Event shows picture #{id} but never erases it; it stays on screen after the event ends. Ignore this if it is a permanent UI",
  "checker.core.unreachableMap":
    "Map {id} ({name}) is unreachable from the start (transfer graph only; vehicle/script transfers excluded)",
  "checker.core.textOverflow":
    "Dialogue line is about {width} chars wide, window capacity is about {capacity} — may overflow and wrap incorrectly",
  "checker.core.transferOutOfBounds":
    "{what} target ({x}, {y}) is outside map {mapId} ({width}×{height}) — transfer out of bounds",
  "checker.core.transferBlockedTile":
    "{what} target ({x}, {y}) is a blocked tile (all four directions blocked) — the character is stuck in a wall",
  "checker.core.transferNoEscape":
    "{what} point ({x}, {y}) is surrounded by blocked tiles or map edges — the character cannot leave (softlock candidate)",
  "checker.core.kind.switch": "Switch",
  "checker.core.kind.variable": "Variable",
  "checker.core.what.start": "Start",
  "checker.core.what.transfer": "Transfer",
  "checker.core.category.map": "Map",
  "checker.core.category.switch": "Switch",
  "checker.core.category.variable": "Variable",
  "checker.core.category.commonEvent": "Common Event",
  "checker.core.category.item": "Item",
  "checker.core.category.weapon": "Weapon",
  "checker.core.category.armor": "Armor",
  "checker.core.category.skill": "Skill",
  "checker.core.category.actor": "Actor",
  "checker.core.category.troop": "Troop",
  "checker.core.category.enemy": "Enemy",
  "checker.core.category.class": "Class",
  "checker.core.category.tileset": "Tileset",
  "checker.core.category.system": "System",
  "checker.core.category.animation": "Animation",
  "checker.core.location": "{p0}{p1}{p2}{p3}{p4}",
  "checker.core.location.sep": " · {part}",
  "checker.core.location.unknown": "Unknown location",
  "checker.core.location.map": "Map {id}",
  "checker.core.location.event": "Event {id}",
  "checker.core.location.page": "Page {page}",
  "checker.core.location.command": "Command {index}",
  "checker.core.location.data": "{label} {id}",
} as const;

type CoreKey = keyof typeof zh;

/** 类型化消息构造：键必须存在于本目录（拼错 = 编译错误），import 即完成注册 */
export function core(
  key: CoreKey,
  params?: Record<string, string | number | LocalizableMessage>,
): LocalizableMessage {
  return msg(key, params);
}

/** 位置 dataKey → 类别标签键（与 core/src/report.ts 的 DATA_LABELS 对应） */
const DATA_LABEL_KEYS: Record<string, CoreKey> = {
  system: "checker.core.category.system",
  actor: "checker.core.category.actor",
  commonEvent: "checker.core.category.commonEvent",
  tileset: "checker.core.category.tileset",
  enemy: "checker.core.category.enemy",
  animation: "checker.core.category.animation",
  troop: "checker.core.category.troop",
  item: "checker.core.category.item",
  skill: "checker.core.category.skill",
};

/**
 * 位置描述的可本地化构造：等价于 @rmtest/core 的 formatLocation，
 * 但各段与分隔符均为目录消息，渲染时按目标语言递归本地化。
 */
export function locationMsg(loc: ReportLocation | undefined): LocalizableMessage {
  if (!loc) return core("checker.core.location.unknown");
  const parts: LocalizableMessage[] = [];
  if (loc.mapId) parts.push(core("checker.core.location.map", { id: loc.mapId }));
  if (loc.eventId) parts.push(core("checker.core.location.event", { id: loc.eventId }));
  if (loc.pageIndex !== undefined) parts.push(core("checker.core.location.page", { page: loc.pageIndex + 1 }));
  if (loc.commandIndex !== undefined) parts.push(core("checker.core.location.command", { index: loc.commandIndex }));
  if (loc.dataKey && loc.dataId) {
    const labelKey = DATA_LABEL_KEYS[loc.dataKey];
    parts.push(core("checker.core.location.data", { label: labelKey ? core(labelKey) : loc.dataKey, id: loc.dataId }));
  }
  if (parts.length === 0) return core("checker.core.location.unknown");
  const params: Record<string, string | LocalizableMessage> = { p0: parts[0]!, p1: "", p2: "", p3: "", p4: "" };
  for (let i = 1; i < parts.length; i++) params[`p${i}`] = core("checker.core.location.sep", { part: parts[i]! });
  return core("checker.core.location", params);
}

registerCatalog({ zh, ja, ko, en } satisfies CatalogOf<typeof zh>);
