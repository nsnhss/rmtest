# rmtest — 数据驱动游戏引擎自动化 bug 检测器

针对 RPG Maker（MV/MZ 全能力；RGSS、2k/2k3 静态）、TyranoScript 视觉小说、GB Studio 与 Godot 4.x 工程的自动化测试工具：静态分析 + 语义检查 + 动态执行测试。

**定位：面向游戏开发者本人的自测工具。** 请只对你自己的工程（未加密或你本人加密）使用；本工具不是解密器。

**界面语言：中文 / 日本語 / 한국어 / English**（CLI `--lang`、环境变量 `RMTEST_LANG`、桌面应用语言选择器）。

## 现状

| 能力 | 说明 |
|---|---|
| 静态扫描 | `pnpm scan <工程目录> [--incremental] [--checkers <插件目录>]` → 控制台摘要 + `rmtest-report.html`；增量模式基于内容哈希报变更文件、无变更跳过 |
| 语料维护 | `pnpm maintain <工程目录> <语料.json>` → fresh/broken/stale 三分类 + 机械重链 |
| 34 个检查器 | 悬空引用、大小写、资源规格、脸图/图标越界、图片出屏、对话溢出、条件恒假、死逻辑、传送软锁（越界/卡墙/死格）、地图可达性、CJK 字体缺失、首触发恒假；Tyrano：跳转断链、缺失素材、自跳死循环、入口缺失、不可达标签、语法；GB Studio：断链引用、起始场景、碰撞软锁、资产缺失、标签断链；Godot：资源缺失、场景实例环、连接处理函数、主场景/autoload 配置、节点路径断链；2k/2k3：传送目标、引用越界、地图树、素材缺失、工程完整性 |
| 动态测试（真实引擎） | 场景 DSL 执行 `run`（walk 走真实瓦片通行性路径、choose 真实选项导航）、随机探索 `fuzz`（种子可复现，步数预算为主界）、截图基线 `golden`、键盘录制 `record`、一键回归 `regress`——全部跑在真实 MV/MZ 引擎上 |
| 时效性引擎 | fresh/broken/stale 三分类 + 内容哈希机械重链（地图 + 开关/变量写入签名粒度） |
| AI 层 | `aigen` 自然语言生成场景（校验闸门循环）、`repair` 过时场景修复提案、`explain` 失败轨迹翻译——本地 Ollama，判定始终在确定性引擎 |
| 部署验收 | `pnpm deploy:check <部署产物目录>`：加密产物解析（MV `.rpgmvp/.rpgmvo` 与 MZ 的 `.png_/.ogg_`）+ 大小写专项 + 字体检查 |
| 多引擎 | MV/MZ 全能力（含加密资源解密、MZ 工程识别）；**RGSS（VX Ace/XP/VX）静态分析**——Ruby Marshal 完整解析（Table、对象链接、补码长整数）+ 自动识别；**RM2k/2k3 静态分析**——LCF 二进制解析（计数按剩余字节钳制）+ 传送/引用/地图树/素材检查；**TyranoScript 静态分析**——场景跳转断链/缺失素材/死循环/入口缺失/不可达标签/语法检查；**GB Studio 静态分析**——.gbsproj 新旧双格式（含 id-keyed 资源容器）+ 断链引用/碰撞软锁/资产缺失/标签断链；**Godot 4.x 静态分析**——资源引用/实例环/连接处理/节点路径断链，scan/deploy/maintain 等静态命令直接可用 |
| 插件生态 | 用户自写 checker 文件级分发：`scan --checkers <目录>` 加载，加载期 irVersion 兼容闸门，坏插件隔离；插件文案可注册进多语言目录 |
| 桌面应用 | `pnpm desktop`：扫描/维护/内容/AI 生成/场景库/运行中心/覆盖趋势/动态测试(fuzz/golden/录制) 全视图，界面四语言可切换 |

**测试：287 个（269 通过 / 18 门控跳过 / 0 失败）**（`pnpm test`）；其中 18 个真实引擎验证用例设置 `RM_REAL_PROJECT` 指向你的 MV/MZ 工程即启用；类型检查 `pnpm typecheck`。

### 测试体系

| 层 | 内容 | 位置 |
|---|---|---|
| 单元 | core 事实/IR 契约、DSL 校验、freshness 重链、store、refgraph 全命令扫描、i18n 目录完整性 | `packages/core|dsl|freshness|store|i18n/test` |
| 集成 | 6 引擎检查器 × 适配器全链路（合成工程 → 加载 → 检查） | `packages/checkers|adapters/*/test` |
| 接口 | CLI 全部命令函数级 + 入口黑盒（真实进程 spawn：参数分派/退出码/错误路径/带值选项/pnpm 透传）；包 API 导出契约 | `packages/cli/test` |
| 性能 | 300 地图 × 10 事件工程全量扫描（<1s，RSS +40MB）、增量无变更跳过、RM2k 大地图二进制解析 | `packages/cli/test/perf.test.ts` |
| 健壮性 | 损坏/截断 LCF 输入、BER 溢出、**超大声明计数（4e9）结果有界**、伪随机字节全量遍历不崩溃 | `packages/adapters/rm2k/test/robust.test.ts` |
| E2E | 真实 MV 引擎 18 项（run/fuzz/golden/录制/回归 + 加密资源解密与尺寸解析）+ 桌面应用（UI 冒烟 + 语言切换 + fuzz/golden/录制按钮真实引擎） | `packages/runtime|desktop|adapters/mv/test`（env 门控） |

覆盖率：`pnpm coverage`——行 72.27% / 分支 59.64%（含 6 个引擎适配器）。桌面主进程与页面内执行代码因打包/跨上下文执行，覆盖率不归因回源（测量伪影，非测试缺口）。

## 快速开始

```bash
# 环境：Node >= 24 + pnpm
pnpm install
pnpm test          # 全量测试（含真实 Electron 驱动的动态测试）
pnpm typecheck

# 用起来
pnpm scan ./你的MV工程                          # 静态扫描 → HTML 报告（报告写在工程目录内）
pnpm scan ./你的MV工程 --incremental            # 增量扫描：无变更跳过重扫
pnpm scan ./你的MV工程 --checkers ./我的插件目录 # 加载自写检查器（irVersion 闸门）
pnpm scan ./你的MV工程 --lang en                # 报告语言：zh / ja / ko / en（或 RMTEST_LANG）
pnpm maintain ./你的MV工程 ./corpus.json        # 语料三分类 + 重链
pnpm content ./你的MV工程 ./baseline.json       # 新内容检测（可达事件页 diff）
pnpm aigen ./你的MV工程 "测试屠龙任务的完整流程"  # AI 生成场景（Ollama + 聊天模型）
pnpm explain ./你的MV工程 ./场景.json           # 失败轨迹解释（Ollama + 聊天模型）
pnpm repair ./你的MV工程 ./corpus.json          # 过时场景修复提案（Ollama + 聊天模型）
pnpm scene:run ./你的MV工程 ./场景.json         # 真引擎执行场景
pnpm fuzz ./你的MV工程                           # 真引擎随机探索
pnpm fuzz ./你的MV工程 --seed 42 --steps 200     # 可复现跑法（--time 仅作挂钟安全上限）
pnpm golden ./你的MV工程 approve 菜单           # 截图基线审批
pnpm corpus ./你的MV工程 add ./场景.json        # 场景入库
pnpm regress ./你的MV工程                       # 一键回归
pnpm deploy:check ./你的部署产物目录             # 部署验收
pnpm desktop                                    # 桌面应用

# 网络受限时的备用推送（走 api.github.com，不依赖 git 协议连通性）
GITHUB_TOKEN=ghp_xxx node scripts/push-via-api.mjs            # 推送本地未推送的提交
GITHUB_TOKEN=ghp_xxx node scripts/push-via-api.mjs --dry-run  # 只列出待推送文件
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
├── adapters/*   其它引擎适配器：rgss / rm2k / tyrano / gbs / godot
├── checkers/    静态检查器插件（每个自带 fixture 回归资产）+ 插件加载器（irVersion 闸门）
├── dsl/         场景 DSL（zod schema）+ 校验闸门
├── runtime/     Electron(CDP) 桥、场景执行器、覆盖计数、fuzz、求解器、截图/golden
├── freshness/   时效性三分类 + 机械重链
├── store/       项目库（SQLite via node:sqlite，零原生依赖）
├── report/      类型化报告 → HTML（XSS 转义、未知类型优雅降级、多语言）
├── i18n/        界面多语言（zh/ja/ko/en）：目录自注册、类型化键、语言解析
└── cli/         12 个命令入口（scan / maintain / content / … / deploy）
```

核心方法论文档见 [docs/architecture.md](docs/architecture.md)，路线图见 [docs/roadmap.md](docs/roadmap.md)，评估驱动的修复计划见 [docs/repair-plan.md](docs/repair-plan.md)。

## 多语言

界面文案全部走 `@rmtest/i18n` 目录（zh / ja / ko / en 键集一致，漏译 = 编译错误）：

```bash
pnpm scan ./工程 --lang ja          # CLI 输出 + HTML 报告都用日文
RMTEST_LANG=ko pnpm scan ./工程      # 或环境变量
pnpm desktop                        # 桌面右上角下拉切换，选择记忆在本地
```

判定层（检查器/facts）不感知语言：消息是「中文原文 + 目录键 + 参数」，渲染时按语言查表，缺失回退中文。
参数值本身也可以是可本地化消息（如「开关/switch/スイッチ」逐层渲染）。

## 已知限制

见 [docs/roadmap.md](docs/roadmap.md) 的「已知限制」：VX Ace/XP 的显示层检查（对话溢出、资源规格）未建模故空转；
动态层 Windows-only（硬编码 `electron.exe`）；真实引擎 E2E 需自备工程（CI 只跑确定性层）。

## 许可

MIT。引擎运行时所含的 RPG Maker 版权文件不属于本仓库；真实引擎（`rpg_*.js`）的验证使用你自有安装。

## 致谢

本项目作为软件测试方向的实践作品开发：测试金字塔、覆盖度度量、fuzz、回归闭环、测试时效性管理在一个非主流领域（游戏引擎数据）上的完整落地。
