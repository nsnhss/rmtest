# rmtest — RPG Maker 自动化 bug 检测器

针对 RPG Maker（当前支持 MV/MZ）游戏工程的自动化测试工具：静态分析 + 语义检查 + 动态执行测试。

**定位：面向游戏开发者本人的自测工具。** 请只对你自己的工程（未加密或你本人加密）使用；本工具不是解密器。

## 现状

| 能力 | 说明 |
|---|---|
| 静态扫描 | `pnpm scan <工程目录>` → 控制台摘要 + `rmtest-report.html`（按严重度/置信度分组，带编辑器坐标） |
| 语料维护 | `pnpm maintain <工程目录> <语料.json>` → fresh/broken/stale 三分类 + 机械重链 |
| 12 个检查器 | 悬空引用、大小写、资源规格、脸图/图标越界、图片出屏、对话溢出、条件恒假、死逻辑、传送软锁（越界/卡墙/死格）、地图可达性 |
| 动态测试机制 | 场景 DSL + 校验闸门 + 执行器（断言/失败即停）+ 覆盖计数 + fuzz + 求解器补测 + golden 截图 diff（当前在 stub 运行时上验证机制，真实引擎接入见路线图） |
| 时效性引擎 | 测试实例与游戏内容的绑定指纹：fresh/broken/stale 三分类、内容哈希机械重链 |
| 插件生态 | 用户自写 checker 从目录动态加载，坏插件隔离 |
| AI 场景生成 | `pnpm aigen <工程> "自然语言需求"` → 校验闸门循环 → 合法场景 JSON（本地 Ollama + 聊天模型；判定与执行始终在确定性引擎，AI 只做翻译） |
| 桌面应用 | `pnpm desktop`：扫描/维护/新内容三视图 |

**测试：111 个，全部通过**（`pnpm test`）；类型检查 `pnpm typecheck`。

## 快速开始

```bash
# 环境：Node >= 24 + pnpm
pnpm install
pnpm test          # 全量测试（含真实 Electron 驱动的动态测试）
pnpm typecheck

# 用起来
pnpm scan ./你的MV工程
pnpm maintain ./你的MV工程 ./corpus.json [--apply]
pnpm aigen ./你的MV工程 "测试屠龙任务的完整流程"   # 需要 Ollama + 聊天模型（默认 qwen3:1.7b）
pnpm desktop                                          # 桌面应用
```

语料 JSON 格式（场景 DSL）示例：

```json
[
  {
    "id": "屠龙任务",
    "game_fingerprint": "创建时的扫描指纹",
    "steps": [
      { "type": "start_new_game" },
      { "type": "walk", "to": { "map": 7, "x": 12, "y": 5 } },
      { "type": "interact", "direction": "up" },
      { "type": "choose", "index": 1 },
      { "type": "assert_switch", "switchId": 12, "value": true },
      { "type": "assert_map", "map": 8 }
    ]
  }
]
```

## 架构

monorepo（pnpm workspaces），薄内核 + 插件注册 + 归一化 IR：

```
packages/
├── core/        内核编排、IR（版本化只增不改）、facts（引用图/生命周期）、命令遍历器
├── adapters/mv/ MV/MZ 适配器：解密（自实现）、数据解析 → IR、工程加载、内容指纹
├── checkers/    静态检查器插件（每个自带 fixture 回归资产）+ 插件加载器
├── dsl/         场景 DSL（zod schema）+ 校验闸门
├── runtime/     Electron(CDP) 桥、场景执行器、覆盖计数、fuzz、求解器、截图/golden
├── freshness/   时效性三分类 + 机械重链
├── store/       项目库（SQLite via node:sqlite，零原生依赖）
├── report/      类型化报告 → HTML（XSS 转义、未知类型优雅降级）
└── cli/         scan / maintain 命令
```

核心方法论文档见 [docs/architecture.md](docs/architecture.md)，路线图见 [docs/roadmap.md](docs/roadmap.md)。

## 许可

MIT。引擎运行时所含的 RPG Maker 版权文件不属于本仓库；真实引擎（`rpg_*.js`）的验证使用你自有安装。

## 致谢

本项目作为软件测试方向的实践作品开发：测试金字塔、覆盖度度量、fuzz、回归闭环、测试时效性管理在一个非主流领域（游戏引擎数据）上的完整落地。
