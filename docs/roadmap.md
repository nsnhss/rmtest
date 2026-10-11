# 路线图与已知缺口

## 已完成

- P0：MV/MZ 解密 + 解析 → IR；Electron CDP 驱动事件解释器（stub 运行时验证机制）
- P1：静态 MVP —— 12 检查器 + HTML 报告 + CLI scan
- P2：生命周期 facts + 条件恒假/死逻辑 + 传送软锁 + 可达性
- P3：场景 DSL + 校验闸门 + 执行器 + 覆盖计数 + fuzz + 求解器补测 + golden 截图 diff
- P4：时效性三分类 + 机械重链 + 项目库（SQLite）+ CLI maintain
- P6（部分）：插件加载器（用户自写 checker）
- **TyranoScript 静态支持**：.ks 场景解析器（标签/跳转/资产引用/条件跟踪）+ Config.tjs 入口 + 资产清单加载器 + CLI 自动识别 + 6 项检查（跳转断链、缺失素材、自跳死循环、入口缺失、不可达标签、结构语法）；动态执行待有真实游戏工程后接入（Electron 层可整体复用）
- **GB Studio 静态支持**：.gbsproj 解析（现代 4.3+ 资源格式与旧版 ≤4.2 格式双轨归一 + 碰撞串解压）+ CLI 自动识别 + 5 项检查（断链引用全谱、起始场景、碰撞软锁（起始/传送/演员出生实心 + TOPDOWN BFS 不可达）、资产缺失、标签断链）；依据官方仓库事件定义实证（含 LAST_SCENE/LAST_SPRITE/$self$ 等哨兵值）
- **Godot 4.x 静态支持**：project.godot（ConfigFile）解析 + .tscn/.escn/.tres 文本解析（ext_resource/instance/script/connection，路径含 res:// 与相对路径双形态，依据 godot-docs tscn.rst 实证）+ 全文件清单与 uid→path 映射 + CLI 自动识别 + 5 项检查（资源缺失含大小写降级、PackedScene 实例环、连接处理函数、主场景/autoload 配置、脚本节点路径断链——get_node/$/^ 字面量在挂载场景树中逐段解析）
- **RM2k/2k3 静态支持**：LCF 二进制解析（BER 整数/结构块/向量/事件命令，全部依据 liblcf 源码与 EasyRPG Player 解释器实证）+ RPG_RT.lmt/.ldb/Map*.lmu + CLI 自动识别 + 5 项检查（传送目标缺失/越界/传向区域、开关/变量/公共事件/图块集/动画/事件引用越界、地图树完整性（lmu 无登记/登记无 lmu/父链断裂）、素材缺失（音乐/音效/图/行走图/脸图/全景/战斗背景，大小写与扩展名不敏感）、工程级完整性）。图块通行性（chipsets passable_data）暂缓

## 已知缺口（按优先级）

1. **真实 MV/MZ 引擎端到端验证**（最高优先）：✅ 已完成——解释器级与场景级全链路（进入地图场景、对话触发与确认、**选项导航**、存档往返、**walk 瓦片通行性路径模拟**、fuzz/golden/录制/回归）。**验证抓出并修正的保真 bug**：201 六参格式、122 常量位置、快照稀疏数组、checkPassage 方向位语义、选项分支缩进结构（402 与 102 同级）、帧循环吞键（轮询确认模式）。
2. **条件可满足性（有界抽象执行）**：✅ 已实现声音子集——首触发恒假检查器（写入点全部位于判断之后且无外部写入 = 首次触发必假）。带事件重入语义的全量抽象执行仍暂缓。
3. **增量分析**：✅ 已实现——基于内容哈希的变更检测（`scan --incremental`）：无变更跳过重扫、有变更列出受影响文件。文件 diff → 脏 facts 传播的细粒度增量仍暂缓（当前全量扫描足够快）。
4. **AI 视觉抽检**：文本链路（生成/修复/翻译）已完成并用 `qwen3:1.7b` 真实验证。**视觉抽检**（截图→异常评分）未做：需要视觉模型（llava/qwen-vl），当前机器内存 3GB 空闲不够跑视觉模型。
5. **RGSS（VX Ace/XP/VX）与 2k/2k3 适配器**：✅ RGSS 静态支持已实现——Ruby Marshal 解析器（.rvdata2/.rvdata/.rxdata，含 Table 类型精确解码）+ 数据→IR（含地图地面层、图块 flags）+ 工程加载器 + CLI 自动识别。软锁/可达性检查对 VX Ace 可用。动态执行依赖 mkxp-z（未做）；2k/2k3 依赖 liblcf（未做）。
6. **开关/变量的个体粒度重链**：✅ 开关与变量均已实现（写入签名哈希 + 唯一匹配迁移）。
7. **部署产物验收模式**（分发版测试）：✅ 加密产物（.rpgmvp/.rpgmvo）解密映射 + `deploy` 命令（大小写专项/加密解析/字体检查）；编辑器真实部署产物的验证仍建议做一次。
8. **插件分发渠道**：✅ 文件级分发约定（单文件 ES 模块 + loadCheckersFromDir + 示例插件 + 文档）；无发布平台（对社区场景文件分享最直接）。

## 候选引擎扩展（已评估）

按"静态成本 × 动态复用度 × 需求"排序；启动任意一项前复核其数据格式文档。

| 引擎 | 静态 | 动态 | 结论 |
|---|---|---|---|
| TyranoScript（TyranoBuilder） | ✅ 已做：.ks 纯文本，6 项检查 | HTML5 → Electron 层整体复用（待真实游戏工程） | **首选，已落地静态** |
| GB Studio | ✅ 已做：.gbsproj 双格式解析 + 5 项检查（断链/软锁/资产/标签） | 引擎为 GB ROM 编译目标，动态需模拟器宿主（未做） | **第二顺位，已落地静态** |
| Godot 4.x | ✅ 已做：project.godot/.tscn/.tres 解析 + 5 项检查（资源缺失/实例环/连接处理/主场景/节点路径断链） | `--headless` + GUT 生态成熟；动态层需集成 Godot 二进制（未做） | **第三顺位，已落地静态** |
| 2k/2k3 | ✅ 已做：LCF 二进制解析（liblcf 实证）+ 5 项检查（传送/引用越界/地图树/素材/工程完整性） | EasyRPG Player（GPL，活跃）可当宿主（未做） | **第四顺位，已落地静态** |
| Wolf RPG / SRPG Studio / KRKR / Ren'Py / SGB / Bakin / PGM MV | 私有二进制或品类不匹配 | 原生 exe / 无宿主 | 暂不做 |

## 不做的事（定位边界）

- 不提供游戏内容提取/破解他人游戏的能力（定位声明见 README）
- 不做叙事/审美判断（AI 可"标记可疑"，确定性工具不"判定"）
- 不承诺"覆盖 Unity/UE"：IR 只服务数据驱动引擎（RPG/VN）；编译型引擎是另一套技术
- 动态层只服务有可自动化运行时（浏览器/开源解释器）的引擎；原生 exe 注入式驱动不做

## 修复轮（2026-10-11，评估驱动）

依据评估发现的问题逐条修复，全部带回归测试（修复前失败 / 修复后通过），真实工程实测：

| 缺陷 | 修复 | 证据 |
|---|---|---|
| MV/MZ 加密资源用 `encryptionKey` 的 ASCII 字节做密钥流 → 加密工程全部解不开 | 改为十六进制解码的 16 字节；补 MZ 的 `.png_/.ogg_/.m4a_` 后缀映射 | 真实 MV/MZ 工程：解出 PNG 魔数、资源尺寸全部可解析（新增 `RM_REAL_PROJECT` 门控用例） |
| RGSS 只支持 `U`(0x55) 而真实流用 `u`(0x75)；`readLong` 未按 Ruby 补码语义 → 156 个 `.rvdata` 中大量整文件丢弃 | 0x75 + 长度前缀；Ruby `r_long` 精确实现；Marshal 对象链接 `@`(0x40) 对象表；嵌套深度护栏 | 真实 VX Ace 工程 156/156 文件解析成功，141 张地图带真实图块数据 |
| RM2k LCF 向量计数直接采信 BER 声明值（16 字节输入可申请 40 亿对象 → OOM） | 所有计数按剩余字节/块长钳制 | 16 字节 LMU 声明 200000/4e9 → 结果有界（0 个事件），时间线性 |
| GB Studio `.gbsproj` 资产文件名可路径穿越（任意本地文件读 + 目录列举）；资源容器只认数组（4.x 为 id-keyed 对象） | 绝对路径/`..` 段拒绝；容器双形态归一 | 恶意工程用例：越界文件不被读、不记哈希；id-keyed 场景与数组等价 |
| GBS/Godot/GB 检查器误报：rm2k 地图树 `visited` 跨图共享、Godot `^` 当祖先查找、first-run-false 忽略页面门控、四检查器漏扫公共事件、CJK 正则缺谚文 | 逐条修正（各带修复前失败用例） | `packages/checkers/test/*` |
| `walkPathTo` 通行位取反（用移动方向的位查目标格）→ 穿墙/假不可达，且源格未检查 | 目标格用反向位、补源格检查；方向表单一来源 | 非门控单测（stub `$gameMap`）+ 单向瓦片用例 |
| `hardenPage` 从未接线（网络封锁只在自测里生效）；fuzz 以挂钟截断 → 种子不可复现 | 真实引擎加载路径接线并暴露拦截统计；步数预算为主界、挂钟仅安全上限（`truncated` 标记） | `runtime/test/{security,fuzz,real-fuzz}.test.ts` 双跑一致性 |
| CLI `pnpm scan <目录>` 扫的是 cwd（argv 错位）；带值选项与取值被拆散；`pnpm deploy/run` 与 pnpm 内建命令冲突 | 隐式 scan 归一化（保留选项-取值配对）；补齐脚本；`deploy:check` / `scene:run` 改名 | `cli/test/main-entry.test.ts`（含 pnpm 透传形态与 `--checkers` 取值回归） |
| 插件生态文档声称"已接入 scan"但生产零调用；irVersion 闸门不存在 | `scan --checkers <目录>` 真接入；加载期 irVersion 闸门；加载错误可本地化 | 端到端：插件产出进入报告；irVersion=99 被拒并给出四语言错误 |
| `text-overflow` 单位不一致（半角单位宽 vs 整字容量）→ 真实工程刷出 10365 条误报 | 统一像素度量；仅 MV/MZ 生效（其它引擎窗口度量未建模，空转） | 真实 VX Ace 工程：12825 → 2345 条，误报类别归零 |
| 图标网格按 MV 的 32px 计，VX Ace 是 24px → 112 条图标越界误报 | `GameUniverse.iconCellSize`（MV/MZ 32、VX Ace/XP 24，实测依据） | 真实工程 384×1536 → 1024 格 ≥ 最大 iconIndex 1005，误报归零 |
| 无 CI | `.github/workflows/ci.yml`（typecheck + 全量测试，Windows 运行器） | — |
| 界面仅中文 | 新增 `@rmtest/i18n`：zh/ja/ko/en 全量目录（报告 / CLI / 桌面 / 检查器 / 插件加载错误），CLI `--lang`、`RMTEST_LANG`、桌面语言选择器 | 报告与桌面四语言实测；桌面真实窗口切换 en/ja/ko 断言 |

## 已知限制（当前轮未做）

- **VX Ace/XP 的显示层检查未建模**：`text-overflow`（窗口 544 宽、字号更小）与 `asset-dimension`（行走图 96×128 等）按引擎空转；补测需先实测该引擎度量。
- **VX Ace 图块通行度**（chipsets passable_data）与 2k/2k3 的 chipsets passable_data 暂缓，软锁判定只用「四向全阻挡」近似。
- **动态层 Windows-only**：CLI/桌面硬编码 `node_modules/electron/dist/electron.exe`。
- **真实引擎 E2E 默认跳过**：需 `RM_REAL_PROJECT`，CI 无真机故只跑确定性层。
- **`picture-offscreen` 对 origin=0 只查上界**，负锚点不报（低置信启发式，未改）。
- **覆盖度无门槛**：`pnpm coverage` 仅出报告（当前行 72.27% / 分支 59.64%，已含 6 个适配器），未设阈值。

