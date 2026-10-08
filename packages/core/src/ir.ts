/**
 * 归一化 IR —— 全项目的承重墙。
 *
 * 设计约束（锁死）：
 * 1. 只增不改（additive）：新字段必须可选，旧消费者不受影响。
 * 2. schemaVersion 每次扩展 +1，插件 manifest 声明 irVersion 做兼容闸门。
 * 3. IR 只描述"数据驱动 RPG 引擎"的公共概念，不引入引擎特有实现细节。
 */

export const IR_SCHEMA_VERSION = 1;

export interface IRDocument {
  schemaVersion: number;
  engine: "mv" | "mz";
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
