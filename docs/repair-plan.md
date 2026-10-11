# rmtest 修复计划（Repair Plan）

来源：2026-10-11 项目评估。评估发现的问题按"先恢复可信度、再补安全与可用性、最后校正检查器与文档"排序。

排序原则：**先让工具在真实工程上产出正确结果，再谈覆盖面与生态**。三条 P1 都是"文档声称已实证、实测却失败"，比缺少功能更伤产品可信度。

## 评估验证基线（修复前，已实测）

| 项 | 结果 |
|---|---|
| `pnpm typecheck` | 通过（tsc 7，1.8s） |
| `pnpm test` | 文件 53 pass / 7 skip；用例 221 pass / 17 skip（0 fail）；50.7s |
| 跳过的 17 项 | 全部真实引擎 E2E（`runtime/{realengine,real-scene,recorder}`、`cli/{run,regress,fuzz-golden}`、`desktop/desktop-dynamic`），由 `RM_REAL_PROJECT` 门控 |
| `pnpm scan <目录>` | **扫的是当前工作目录**（argv 错位），非给定目录 |
| MV 解密（真实 `.rpgmvp`） | ASCII 密钥 → 垃圾；hex 解码密钥 → PNG 魔数 ✅ |
| RGSS `Table`（真实 `.rvdata`） | 真实流为 `75 3a 0a "Table"`（tag `u`），解析器只支持 `55`（`U`） |
| RM2k LCF 计数 | 16B 输入声明 2,000,000 → 200 万个对象、+276MB，线性无界 |

## 阶段 0 — 校验护栏（前置）

真实游戏资产有版权、不入库；把缺陷固化为 golden 字节向量，使修复前后可判定。

- 0.1 `packages/adapters/mv/test/`：真实假头（`RPGMV\0\0\0\0\0\3\1\0\0\0\0`）+ 明文 PNG 签名 + 真实 32-hex key 的密文向量。
- 0.2 `packages/adapters/rgss/test/marshal-helpers.ts`：按真实结构编码 `u` 型 Table（符号 + 长度前缀 + 20B 头 + `count*2` 数据）。
- 0.3 `packages/adapters/rm2k/test/robust.test.ts`：超大声明计数用例改为**结果规模有界**断言，不再只 `not.toThrow()`。

## 阶段 1 — 可信度恢复（P0/P1）

### 1.1 MV/MZ 解密 — `packages/adapters/mv/src/{decrypt,loader}.ts`
- `deriveKeyStream`：32 位 hex key → `parseInt(key.slice(2i,2i+2),16)` 解出 16 字节；非 hex 回退现有字节循环。
- 假头对齐真实格式；`ENCRYPTED_EXT` 增补 MZ 的 `.png_/.ogg_/.m4v_/.webm_`。
- `detectEngine`/`loadProject` 的 `mz` 分支接线（此前 MZ 恒被判为 `mv`，`engine="mz"` 是死参数）。

### 1.2 RGSS `Table` — `packages/adapters/rgss/src/marshal.ts`
- `parseValue` 增 `case 0x75`：读符号 → 读 Marshal 整数长度 → 按长度边界消费 Table 头与数据（复用现有逻辑，但以声明长度为准，不信 in-dump count）。
- `parseObject` 的 `"$symbol" in (cls as object)` 在 `cls` 非对象时抛裸 `TypeError` → 加守卫；Table 数据偏移用 `Math.max(0, count*2)` 防负回卷。

### 1.3 LCF 计数上界 — `packages/adapters/rm2k/src/parse.ts`
- 9 处 `const count = r.readInt()` 循环加预算钳制（块级用 `len`，命令级用 `end - pos`，其余用剩余字节/最小元素字节）。

## 阶段 2 — 安全

- 2.1 `packages/adapters/gbs/src/loader.ts`：join 前拒绝绝对路径与含 `..`/`.`/空段的 `filename`（当前可读任意本地文件并列举目录）。
- 2.2 `packages/adapters/gbs/src/parse.ts`：`asArr` 兼容 id-keyed 资源映射（GB Studio 3/4.x 真实格式），否则 `scenes: []`、五项检查空跑。

## 阶段 3 — 可用性

- 3.1 `packages/cli/src/main.ts`：`argv[2]` 非已知动词时按"隐式 scan"处理（把该参数当工程目录），修 `pnpm scan <目录>` 扫错目录。
- 3.2 `package.json` 补齐 `maintain/aigen/…` 脚本；README 中与 pnpm 内建 `run` 冲突的 `pnpm run <工程> <场景>` 改用显式入口。
- 3.3 `packages/cli/test/main-entry.test.ts` 覆盖 pnpm 透传形态，使文档用法进测试门禁。

## 阶段 4 — 检查器误报面

| 项 | 文件 | 修正 |
|---|---|---|
| 4.1 | `checkers/rm2k.ts` | `visited` 移入单地图作用域（同父多子被误报"父链不连通"） |
| 4.2 | `checkers/godot.ts` | `^"X"` 是 `NodePath()` 字面量简写，非祖先查找 |
| 4.3 | `checkers/first-run-false.ts` | 读取 `page.conditions`，页面被同一开关门控时不得报"条件恒假" |
| 4.4 | `reachability/transfer/picture/face-index` | 补扫 `ir.commonEvents`（共享门/菜单） |
| 4.5 | `font.ts` / `text-overflow.ts` | CJK 正则补谚文 `U+AC00–U+D7A3`（文案已声称支持韩文） |

## 阶段 5 — 动态层保真（真机可验：`D:/1` 存在完整 MV/MZ 工程）

- 5.1 `packages/runtime/src/realengine.ts`：`walkPathTo` 目标格通行位应取移动方向的**反向**位（引擎 `isMapPassable` 语义），并补源格检查。
- 5.2 `security.ts` 的 `hardenPage` 接线到真实引擎加载路径（当前仅自测调用）；`fuzz` 预算改确定性上界，兑现种子可复现承诺。

## 阶段 6 — 插件生态落地

`loadCheckersFromDir` 生产零调用而四处文档声称"已接入 scan"。二选一并消除不一致：接入 `scan --checkers <目录>`（含 irVersion 严格闸门 + 插件根白名单），或删除并改文档。取**接入**方案，因插件生态是差异化点。

## 阶段 7 — CI 与文档对齐

- `.github/workflows/ci.yml`：`install + typecheck + test`（默认 221 项），真机 E2E 作可选 job。
- 覆盖率 include 纳入 `packages/**/src/**`（当前 `packages/*/src/**` 结构性排除 6 个适配器）。
- 修正文档声明：测试数（238 总 / 17 门控跳过）、`architecture.md` 重链现状、插件生态描述、`pnpm` 命令清单。

## 阶段 8 — 多语言（中日韩英）

目标：应用界面与报告可切换 zh / ja / ko / en。

- 8.1 新包 `@rmtest/i18n`：消息目录（zh/ja/ko/en）、locale 解析（`RMTEST_LANG` 环境变量 → CLI `--lang` → 桌面设置 → 系统默认）、`t(key, params)`。
- 8.2 `ReportSection` 增 `messageId` + `messageParams`（保留 `message` 作为回退），使消息可本地化而非烧死在源码里。
- 8.3 34 个检查器消息迁移到 key（按引擎分组、每组独占一个目录分片文件，避免共享文件冲突）。
- 8.4 报告 HTML、CLI 摘要、桌面 UI 接入 i18n；桌面提供语言切换并持久化。

## 验收

- 阶段 0 的三个 golden 向量：修复前 fail、修复后 pass。
- `pnpm typecheck` + `pnpm test` 全绿；门控用例在设 `RM_REAL_PROJECT` 后真实执行。
- 真实加密 MV 工程 `scan` 出资源尺寸（解密生效）；真实 RGSS 工程读到地图数据（`Table` 解析生效）。
- 四种语言下报告与桌面界面文案完整，无缺 key 回退痕迹。

---

## 执行结果（2026-10-11 完成）

**基线 → 现状**：测试 238（221 通过 / 17 门控）/ 0 fail → **287（269 通过 / 18 门控）/ 0 fail**；`pnpm typecheck` 干净；
覆盖率（纳入 6 个适配器后）行 72.27% / 分支 59.64%。

阶段 0–7 全部完成，逐条证据见 `docs/roadmap.md` 的「修复轮」。阶段 8（多语言）完成：
新包 `@rmtest/i18n`（目录自注册 + 类型化键集）+ 报告/CLI/桌面/检查器/插件加载错误的四语言文案，
CLI `--lang`、`RMTEST_LANG`、桌面语言选择器（真实 Electron 窗口内切换并断言 en/ja/ko）。

**计划外新增（实测发现后追加）**：

1. **RGSS `readLong` 补码语义错误**（原计划只修 `0x75`）：真实 `.rvdata` 中 52 个文件因此整文件丢弃，
   修正后 156/156 解析成功、141 张地图带真实图块数据。
2. **RGSS 对象链接 `@`(0x40) 与嵌套深度护栏**（修 Table 后暴露的下一层阻塞）。
3. **`text-overflow` 单位不一致**（半角单位宽 vs 整字容量）：真实工程 10365 条误报 → 0；
   同时按引擎空转（VX Ace 窗口度量未建模）。`asset-dimension` 同理按引擎空转。
4. **VX Ace 图标网格 24px**（原按 MV 32px）：112 条图标越界误报 → 0，依据真实工程 384×1536 → 1024 格。
5. **CLI 带值选项与取值被拆散**（`--checkers`/`--lang` 不可用）：归一化保留配对；
   `pnpm deploy` / `pnpm run` 与 pnpm 内建命令冲突 → 改名 `deploy:check` / `scene:run`。
6. **fuzz 可复现性扩展到引擎实现路径**（`real-fuzz.ts`）与 CLI 输出（打印 seed / truncated）。

**未做（记入 roadmap「已知限制」）**：VX Ace/XP 显示层检查建模、chipsets 通行度、跨平台动态层、
CI 真机 job、覆盖率阈值、`picture-offscreen` origin=0 负锚点。
`examples/**` 不参与 typecheck（作为分发样例，按设计留在 tsconfig 之外）。
