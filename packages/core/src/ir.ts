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
}

export interface IRMap {
  id: number;
  name: string;
  width: number;
  height: number;
  tilesetId: number;
  /** 瓦片数据 width*height 整数 */
  data: number[];
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
  ControlSwitches: 121,
  ControlVariables: 122,
  TransferPlayer: 201,
  CallCommonEvent: 117,
  ShowPicture: 231,
  ErasePicture: 235,
} as const;

export interface IRCommand {
  code: number;
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
