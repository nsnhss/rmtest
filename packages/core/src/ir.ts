/**
 * 归一化 IR —— 全项目的承重墙。
 *
 * 设计约束（锁死）：
 * 1. 只增不改（additive）：新字段必须可选，旧消费者不受影响。
 * 2. schemaVersion 每次扩展 +1，插件 manifest 声明 irVersion 做兼容闸门。
 * 3. IR 只描述"数据驱动 RPG 引擎"的公共概念，不引入引擎特有实现细节。
 */

export const IR_SCHEMA_VERSION = 3;

export interface IRDocument {
  schemaVersion: number;
  engine: "mv" | "mz" | "rgss" | "tyrano" | "gbs";
  engineVersion?: string;
  system: IRSystem;
  maps: IRMap[];
  actors: IRActor[];
  commonEvents: IRCommonEvent[];
  tilesets: IRTileset[];
  items: IRItem[];
  weapons: IRItem[];
  armors: IRItem[];
  skills: IRSkill[];
  troops: IRTroop[];
  enemies: IREnemy[];
  animations: IRAnimation[];
  classes: IRClass[];
  /** TyranoScript 工程专属数据；非 Tyrano 工程为 undefined */
  tyrano?: IRTyranoSection;
  /** GB Studio 工程专属数据；非 GB Studio 工程为 undefined */
  gbs?: IRGBSSection;
}

export interface IRSystem {
  title: string;
  /** 开关名列表；索引即开关 ID（RM 数据 1 起始，0 为空槽） */
  switches: string[];
  /** 变量名列表 */
  variables: string[];
  startMapId: number;
  startX: number;
  startY: number;
  title1Name: string;
  title2Name: string;
  /** 默认系统音频（名称在内部对象里） */
  sounds: Record<"bgm" | "bgs" | "me" | "se", { name: string }>;
  /** 载具行走图 */
  vehicles: Record<"boat" | "ship" | "airship", { characterName: string }>;
}

export interface IRMap {
  id: number;
  name: string;
  width: number;
  height: number;
  tilesetId: number;
  /** 瓦片数据 width*height 整数 */
  data: number[];
  parallaxName: string;
  bgmName: string;
  bgsName: string;
  battleback1Name: string;
  battleback2Name: string;
  /** 遇敌队伍引用 */
  encounterTroopIds: number[];
  events: IREvent[];
}

export interface IREvent {
  id: number;
  name: string;
  x: number;
  y: number;
  pages: IREventPage[];
}

export interface IREventPage {
  /** 页序号（0 起），页从上往下第一个满足条件的生效 */
  index: number;
  conditions: IRPageConditions;
  trigger: number;
  commands: IRCommand[];
}

export interface IRPageConditions {
  selfSwitchCh: string | null;
  switch1Id: number | null;
  switch2Id: number | null;
  variableId: number | null;
  variableValue: number;
  actorId: number | null;
  itemId: number | null;
}

/** MV/MZ 事件命令码（节选，按需扩展） */
export const Cmd = {
  End: 0,
  ShowText: 101,
  ShowTextCont: 401,
  ConditionalBranch: 111,
  CallCommonEvent: 117,
  ControlSwitches: 121,
  ControlVariables: 122,
  ControlSelfSwitch: 123,
  ChangeItems: 126,
  ChangeWeapons: 127,
  ChangeArmors: 128,
  ChangePartyMember: 129,
  RecoverAll: 313,
  TransferPlayer: 201,
  SetMoveRoute: 205,
  ShowPicture: 231,
  ErasePicture: 235,
  ChangeBgm: 241,
  ChangeBgs: 245,
  ChangeMe: 249,
  ChangeSe: 250,
  PlayMovie: 261,
  BattleProcessing: 301,
  ShopProcessing: 302,
  ChangeActorImages: 322,
} as const;

export interface IRCommand {
  code: number;
  /** 嵌套缩进层级，条件分支体判定用 */
  indent: number;
  parameters: unknown[];
}

export interface IRActor {
  id: number;
  name: string;
  classId: number;
  faceName: string;
  faceIndex: number;
  characterName: string;
  characterIndex: number;
}

export interface IRCommonEvent {
  id: number;
  name: string;
  trigger: number;
  switchId: number | null;
  commands: IRCommand[];
}

export interface IRTileset {
  id: number;
  name: string;
  /** A1-A5, B-E 九张图名 */
  imageNames: string[];
  /** 每瓦片 4 方向通行性位（0x1下 0x2左 0x4右 0x8上；全 1 = 不可走） */
  flags: number[];
}

export interface IRItem {
  id: number;
  name: string;
  iconIndex: number;
}

export interface IRSkill {
  id: number;
  name: string;
  iconIndex: number;
}

export interface IRTroop {
  id: number;
  name: string;
  enemyIds: number[];
}

export interface IREnemy {
  id: number;
  name: string;
  battlerName: string;
}

export interface IRAnimation {
  id: number;
  name: string;
  image1Name: string;
  image2Name: string;
}

export interface IRClass {
  id: number;
  name: string;
}

/* ---- TyranoScript（含 TyranoBuilder）附加段 ---- */

/** TyranoScript 视觉小说数据；MV/MZ/RGSS 工程此字段为 undefined */
export interface IRTyranoSection {
  /** 场景清单（相对 data/scenario/，如 "first.ks"） */
  scenarios: IRTyranoScenario[];
  /** 各资产目录文件名清单（含扩展名，原始大小写） */
  assets: Record<"bg" | "fg" | "image" | "se" | "bgm" | "voice" | "video", string[]>;
  /** 入口场景（Config.tjs firstScenario，默认 "first.ks"） */
  entryScenario: string;
  /** 入口标签（Config.tjs firstLabel，默认 "*start"，含 * 前缀） */
  entryLabel: string;
}

export interface IRTyranoScenario {
  /** 相对 data/scenario/ 的文件名 */
  file: string;
  /** 解析出的标签块（按出现顺序） */
  labels: IRTyranoLabel[];
  /** 结构语法错误（未闭合 if/macro 等） */
  syntaxErrors: Array<{ line: number; message: string }>;
}

export interface IRTyranoLabel {
  /** 标签名（不含前导 *） */
  name: string;
  /** 行号（1 起） */
  line: number;
  /** 跳转/调用/按钮/链接目标 */
  jumps: IRTyranoJump[];
  /** 静态资产引用（storage 为字面量时） */
  assets: IRTyranoAssetRef[];
}

export interface IRTyranoJump {
  kind: "jump" | "call" | "button" | "link";
  /** 目标标签名（已去 * 前缀）；动态表达式（&…）为 null */
  target: string | null;
  /** 目标场景文件；null = 当前场景 */
  storage: string | null;
  /** 本标签内该跳转之前是否出现过条件判断（if/elsif）——排除带条件的自跳循环 */
  precededByCondition: boolean;
  line: number;
}

export interface IRTyranoAssetRef {
  kind: "bg" | "fg" | "image" | "bgm" | "se" | "voice" | "video";
  /** 文件名（含扩展名）；动态表达式为 null，跳过检查 */
  storage: string | null;
  line: number;
}

/* ---- GB Studio 附加段 ---- */

/** GB Studio 工程数据；非 GB Studio 工程此字段为 undefined */
export interface IRGBSSection {
  startSceneId: string;
  startX: number;
  startY: number;
  scenes: IRGBSScene[];
  /** 自定义事件（现代格式 "scripts" / 旧格式 "customEvents" 归一化） */
  customEvents: Array<{ id: string; name: string; script: IRGBSScriptEvent[] }>;
  actorPrefabIds: string[];
  triggerPrefabIds: string[];
  spriteIds: string[];
  backgroundIds: string[];
  tilesetIds: string[];
  soundIds: string[];
  musicIds: string[];
  emoteIds: string[];
  avatarIds: string[];
  fontIds: string[];
  paletteIds: string[];
  /** 资产 id → 相对文件路径与磁盘状态（加载器已核对） */
  assetFiles: Array<{ id: string; filename: string; exists: boolean; caseInsensitiveMatch: boolean }>;
}

export interface IRGBSScene {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  backgroundId: string;
  tilesetId: string;
  paletteIds: string[];
  spritePaletteIds: string[];
  playerSpriteSheetId: string | null;
  /** width*height 解压后的碰撞值：0 空 1 实心 2 梯子 3/4 扩展 */
  collisions: number[];
  actors: IRGBSActor[];
  triggers: IRGBSTrigger[];
  scripts: IRGBSScriptSet[];
}

export interface IRGBSScriptSet {
  key: string;
  events: IRGBSScriptEvent[];
}

export interface IRGBSActor {
  id: string;
  name: string;
  prefabId: string | null;
  x: number;
  y: number;
  spriteSheetId: string;
  paletteId: string;
  scripts: IRGBSScriptSet[];
}

export interface IRGBSTrigger {
  id: string;
  name: string;
  prefabId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  scripts: IRGBSScriptSet[];
}

export interface IRGBSScriptEvent {
  id?: string;
  command: string;
  args: Record<string, unknown>;
  children?: Record<string, IRGBSScriptEvent[] | undefined>;
}
