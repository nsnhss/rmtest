/**
 * RM2k/2k3 数据解析 —— RPG_RT.lmt（地图树）、MapXXXX.lmu（地图）、RPG_RT.ldb（数据库子集）。
 * 结构/字段 ID 全部依据 liblcf 源码（generated/lcf/{lmt,lmu,ldb}/chunks.h + 各 reader）。
 */
import type {
  IRRm2kCommand,
  IRRm2kEvent,
  IRRm2kEventPage,
  IRRm2kMapInfo,
} from "@rmtest/core";
import { LcfReader } from "./lcf.ts";

/* ---- 基础结构 ---- */

interface Music {
  name: string;
}

function readMusic(r: LcfReader): Music {
  let name = "";
  r.readStruct({
    0x01: (len) => {
      name = r.readString(len);
    },
  });
  return { name };
}

/* ---- LMT（裸顺序：maps → tree_order → active_node → start） ---- */

function readMapInfo(r: LcfReader, id: number): IRRm2kMapInfo {
  const info: IRRm2kMapInfo = {
    id,
    name: "",
    parent: 0,
    indentation: 0,
    type: -1,
    musicName: "",
    backgroundName: "",
    teleport: 0,
    escape: 0,
    save: 0,
  };
  let musicType = 0;
  r.readStruct({
    0x01: (len) => {
      info.name = r.readString(len);
    },
    0x02: () => {
      info.parent = r.readInt();
    },
    0x03: () => {
      info.indentation = r.readInt();
    },
    0x04: () => {
      info.type = r.readInt();
    },
    0x0b: () => {
      musicType = r.readInt();
    },
    0x0c: () => {
      const m = readMusic(r);
      if (musicType === 2) info.musicName = m.name;
    },
    0x16: (len) => {
      info.backgroundName = r.readString(len);
    },
    0x1f: () => {
      info.teleport = r.readInt();
    },
    0x20: () => {
      info.escape = r.readInt();
    },
    0x21: () => {
      info.save = r.readInt();
    },
  });
  return info;
}

interface Start {
  mapId: number;
  x: number;
  y: number;
}

function readStart(r: LcfReader): Start {
  const start: Start = { mapId: 0, x: 0, y: 0 };
  r.readStruct({
    0x01: () => {
      start.mapId = r.readInt();
    },
    0x02: () => {
      start.x = r.readInt();
    },
    0x03: () => {
      start.y = r.readInt();
    },
  });
  return start;
}

export interface ParsedLmt {
  maps: IRRm2kMapInfo[];
  start: Start;
}

/** LMT = 头字符串("LcfMapTree") + maps 向量 + tree_order + active_node + start */
export function parseLmt(bytes: Uint8Array): ParsedLmt {
  const r = new LcfReader(bytes);
  const header = r.readString(r.readInt());
  const maps: IRRm2kMapInfo[] = [];
  const count = r.readInt();
  for (let i = 0; i < count; i++) {
    maps.push(readMapInfo(r, r.readInt()));
  }
  const treeOrderCount = r.readInt();
  for (let i = 0; i < treeOrderCount; i++) r.readInt();
  r.readInt(); // active_node
  const start = readStart(r);
  if (header !== "LcfMapTree" && header.length !== 0) {
    // 头名不符仍尽力解析（liblcf 也仅警告）
  }
  return { maps, start };
}

/* ---- LMU（结构块） ---- */

function readCommands(r: LcfReader, len: number): IRRm2kCommand[] {
  const end = r.position + len;
  const out: IRRm2kCommand[] = [];
  while (r.position < end) {
    if (r.peek() === 0) {
      r.skip(4); // 4 零字节终止
      break;
    }
    const code = r.readInt();
    if (code === 0) break;
    const indent = r.readInt();
    const str = r.readString(r.readInt());
    const n = r.readInt();
    const parameters: number[] = [];
    for (let i = 0; i < n; i++) parameters.push(r.readInt());
    out.push({ code, indent, string: str, parameters, page: -1 });
  }
  r.skip(end - r.position);
  return out;
}

function readEventPage(r: LcfReader): IRRm2kEventPage {
  const page: IRRm2kEventPage = {
    conditionSwitchIds: [],
    conditionVariableId: null,
    conditionVariableValue: 0,
    charsetName: "",
    trigger: 0,
    commands: [],
  };
  r.readStruct({
    0x02: () => {
      // EventPageCondition：flags(0x01 结构) 跳过，取开关/变量 id
      r.readStruct({
        0x02: () => {
          page.conditionSwitchIds.push(r.readInt());
        },
        0x03: () => {
          page.conditionSwitchIds.push(r.readInt());
        },
        0x04: () => {
          page.conditionVariableId = r.readInt();
        },
        0x05: () => {
          page.conditionVariableValue = r.readInt();
        },
      });
    },
    0x15: (len) => {
      page.charsetName = r.readString(len);
    },
    0x21: () => {
      page.trigger = r.readInt();
    },
    0x34: (len) => {
      page.commands = readCommands(r, len);
    },
  });
  return page;
}

function readEvent(r: LcfReader, id: number): IRRm2kEvent {
  const ev: IRRm2kEvent = { id, name: "", x: 0, y: 0, pages: [] };
  r.readStruct({
    0x01: (len) => {
      ev.name = r.readString(len);
    },
    0x02: () => {
      ev.x = r.readInt();
    },
    0x03: () => {
      ev.y = r.readInt();
    },
    0x05: () => {
      const count = r.readInt();
      for (let i = 0; i < count; i++) {
        r.readInt(); // 页 id
        ev.pages.push(readEventPage(r));
      }
    },
  });
  return ev;
}

export interface ParsedLmu {
  chipsetId: number;
  width: number;
  height: number;
  parallaxName: string;
  events: IRRm2kEvent[];
}

/** LMU = 头字符串("LcfMapUnit") + Map 结构块 */
export function parseLmu(bytes: Uint8Array): ParsedLmu {
  const r = new LcfReader(bytes);
  r.readString(r.readInt()); // header
  const map: ParsedLmu = { chipsetId: 1, width: 0, height: 0, parallaxName: "", events: [] };
  r.readStruct({
    0x01: () => {
      map.chipsetId = r.readInt();
    },
    0x02: () => {
      map.width = r.readInt();
    },
    0x03: () => {
      map.height = r.readInt();
    },
    0x20: (len) => {
      map.parallaxName = r.readString(len);
    },
    0x51: () => {
      const count = r.readInt();
      for (let i = 0; i < count; i++) {
        map.events.push(readEvent(r, r.readInt()));
      }
    },
  });
  return map;
}

/* ---- LDB（数据库子集） ---- */

export interface ParsedLdb {
  version: number;
  title: string;
  switches: string[];
  variables: string[];
  commonEvents: Array<{ id: number; name: string; commands: IRRm2kCommand[] }>;
  chipsets: Record<number, string>;
  animations: Record<number, string>;
}

/** LDB = 头字符串("LcfDataBase") + Database 结构块 */
export function parseLdb(bytes: Uint8Array): ParsedLdb {
  const r = new LcfReader(bytes);
  r.readString(r.readInt()); // header
  const db: ParsedLdb = {
    version: 0,
    title: "",
    switches: [],
    variables: [],
    commonEvents: [],
    chipsets: {},
    animations: {},
  };
  r.readStruct({
    // 大型向量（actors/skills/items/…）未注册 handler → 整块跳过
    0x16: () => {
      // System：只取标题
      r.readStruct({
        0x11: (len) => {
          db.title = r.readString(len);
        },
      });
    },
    0x17: () => {
      const count = r.readInt();
      for (let i = 0; i < count; i++) {
        const id = r.readInt();
        let name = "";
        r.readStruct({
          0x01: (len) => {
            name = r.readString(len);
          },
        });
        if (id >= 1) db.switches[id - 1] = name;
      }
    },
    0x18: () => {
      const count = r.readInt();
      for (let i = 0; i < count; i++) {
        const id = r.readInt();
        let name = "";
        r.readStruct({
          0x01: (len) => {
            name = r.readString(len);
          },
        });
        if (id >= 1) db.variables[id - 1] = name;
      }
    },
    0x19: () => {
      const count = r.readInt();
      for (let i = 0; i < count; i++) {
        const id = r.readInt();
        let name = "";
        let commands: IRRm2kCommand[] = [];
        r.readStruct({
          0x01: (len) => {
            name = r.readString(len);
          },
          0x16: (len) => {
            commands = readCommands(r, len);
          },
        });
        db.commonEvents.push({ id, name, commands });
      }
    },
    0x1a: () => {
      db.version = r.readInt();
    },
    0x14: () => {
      // chipsets：只取名字
      const count = r.readInt();
      for (let i = 0; i < count; i++) {
        const id = r.readInt();
        let name = "";
        r.readStruct({
          0x01: (len) => {
            name = r.readString(len);
          },
        });
        if (id >= 1) db.chipsets[id] = name;
      }
    },
    0x13: () => {
      // animations：只取 Battle 动画文件名
      const count = r.readInt();
      for (let i = 0; i < count; i++) {
        const id = r.readInt();
        let file = "";
        r.readStruct({
          0x02: (len) => {
            file = r.readString(len);
          },
        });
        if (id >= 1) db.animations[id] = file;
      }
    },
  });
  return db;
}
