# Script V2 与 Canvas 交互复刻验收计划

- 审核日期：2026-09-05
- 审核对象：`main` 的前端 + deterministic local mock；不涉及真实后端、官网写操作或凭据。
- 官网事实边界：仅采用现有只读 UI 记录，尤其是 [`pages/canvas/2026-09-05-script-v2-ax-contract.md`](pages/canvas/2026-09-05-script-v2-ax-contract.md)。本文不记录、推导或复用任何官网项目内容、账户信息、素材、提示词、Cookie 或 token。
- 目标解释：所谓“一比一”在本仓必须同时满足 **可观察布局/可访问语义**、**可重复的本地状态机**、**跨刷新持久性** 和 **可执行验收**；local-only 的生成、计费、权限和异步任务不能被描述成官网后端事实。

## 1. 现有证据与结论

| 层 | 已有可验证证据 | 结论 |
| --- | --- | --- |
| 官网 Script V2 可见结构 | 三阶段、十列表格、局部 `ESC` 关闭、镜头排序提示、`重新生成 / 批量生成分镜 / 批量生视频 / 下载` 工具栏及前置不足时的 disabled 投影。 | 已有可复刻的布局和基本 gate 事实；未观察到官网真实请求、成功结果、失败恢复或计费语义。 |
| 本地 Script V2 深度旅程 | `e2e/script-v2.spec.ts` 覆盖三入口、编辑/排序、资产、提示词、批量操作、局部失败、图/视频 materialize、撤销和刷新；该文件每例重置 fixture。 | 本地能力广度高，且存在丰富的 deterministic fixture 证明。 |
| CI 核心门 | `pnpm e2e:ci` 只纳入 `e2e/script-v2-core.spec.ts` 的一个 Script V2 主链例：手写入口、三阶段、十列表头、node 级 batch disabled、阶段切换。 | 能拦截最基础的 Script V2 断裂，不能作为完整交互复刻的放行依据。 |
| Canvas 主路径 | `canvas-parity`、`workflow`、`presence-concurrency`、`video-compositor`、`compositor-reliability` 等专项测试覆盖画布、投影、协作和剪辑行为。 | 这些专项包含大量强证据，但除 presence / compositor reliability 外并不在当前 `e2e:ci` 的完整 canvas 视觉/交互 gate 中。 |
| 视觉证据 | 1440×900 Script V2、canvas、storyboard 等基线已提交；`toHaveScreenshot` 使用稳定等待及严格 diff。 | 基线可做人工/本地回归依据；当前 CI 没有固定平台的 visual job，不能把现有 CI 绿色解释为视觉一比一。 |

**审计结论：**当前仓库足以演示 Script V2 与 canvas 的本地核心能力，但尚不具备“每次 main/tag 自动证明一比一交互复刻”的验收闭环。最短板不是页面数量，而是将已有深度专项证据提升为分层、可追溯、稳定的发布门。

## 2. 缺口矩阵

状态含义：`已覆盖` 表示已有本地可执行证据；`未纳入核心门` 表示测试存在但 `e2e:ci` 不保证执行；`待观察` 表示不可由本地 fixture 反推为官网事实。

| ID | 验收对象 | 当前证据 | 缺口 / 风险 | 优先级 | 可交付验收条件 |
| --- | --- | --- | --- | --- | --- |
| CV-S0 | 官网事实与 local-only 状态的边界 | Script V2 AX contract 已只读、脱敏地记录初始可见结构。 | 官网“完成态”、真实异步、扣费、权限、下载格式和失败文案仍未证实；local 成功 E2E 易被误读为官网事实。 | P0 | 每条新增官网观察都标注观察方法、状态前置、直接可见控件和未知项；local fixture 说明与官网事实分表保存。 |
| CV-S1 | Script V2 核心交互门覆盖度 | `script-v2-core` 有一个主链；详细 spec 有 21 个专项例。 | 详细 spec 不在 `e2e:ci`；入口顺序、ESC 层级、镜头编辑/排序、asset/prompt/batch 成功和失败均可在 CI 绿灯时回归。 | P0 | 将语义最强、无截图依赖的详细例拆入稳定 core 分组；至少覆盖三个入口、局部关闭与焦点、编辑持久化、排序、阶段 gate、一个失败恢复和一次 materialize→reload。 |
| CV-S2 | Script V2 完整阶段状态机 | 本地覆盖确认镜头、准备资产、合成提示词和批量 gate。 | 核心门只检查可跳转，未检查“阶段计数与 row/asset/prompt 状态同步”；错误状态、重试和前进/回退的禁止条件缺少同一端到端断言。 | P0 | 为单一 fixture 流程断言阶段计数、disabled/enabled 原因、asset/prompt 失败→重试、成功后 batch video gate 与 reload 后状态一致。 |
| CV-S3 | 原子 materialize 与重复提交防护 | 详细 spec 验证图/视频节点拓扑、一次 undo 与 reload。 | 未见同一 run 的 double-click/replay、网络超时后重进、部分成功后二次提交等幂等性验收；易出现重复节点或重复扣本地 ledger。 | P0 | 每种 materialize 至少有：重复触发只生成一组、取消不写 graph、失败不产生半拓扑、刷新后重试不重复；同时断言 document revision/节点 ID/账本 mock projection。 |
| CV-C1 | Canvas 到 Storyboard 的端到端主链 | `workflow`、`canvas-parity` 和 Script V2 detail 分别验证建图、投影或 materialize。 | 当前 CI 没有一条从“新项目 → Script V2 → 产物节点 → Storyboard 投影 → 返回 source”的组合链；跨 surface contract 漂移难以及时发现。 | P0 | 核心 browser 分组加入一条小规模、确定性旅程；断言共享 `WorkflowDocument`、切换不产生无关 revision、source 定位可返回，且不依赖真实媒体。 |
| CV-C2 | Canvas 键盘、焦点与层级恢复 | 专项覆盖部分 Escape、Delete、快捷键、可聚焦 edge；Script V2 覆盖 generator 的分层 Escape。 | 关键 overlay 的关闭后焦点回归、Tab 顺序、未保存草稿策略、selection 不应被局部面板改变，尚未形成跨 canvas 的明确矩阵。 | P1 | 对 add menu、Script generator/catalog/workspace、prompt detail、batch dialog、Storyboard detail、Clip editor 各记录 trigger、Escape、关闭后 focus、selection 和 persisted draft 预期。 |
| CV-C3 | 多客户端与编辑冲突 | presence 专项验证 lease、follow、release 后接管。 | 未覆盖 Script V2 打开/编辑期间 revision conflict、远端写入后的草稿冲突提示、重连时工作区状态恢复。 | P1 | 使用两个隔离 context：A 编辑 Script row，B 造成 revision 变化；验证本地草稿不静默覆盖、冲突可定位、刷新/重试结果可预测。 |
| CV-C4 | Canvas / Script V2 视觉发布门 | 现有 1440×900 snapshot 和严格 ratio。 | GitHub Ubuntu CI 不运行固定平台 visual suite；Darwin 基线不能直接作为 Ubuntu 通过条件。 | P1 | 确定唯一截图平台与字体/浏览器版本；建立隔离 `e2e:visual` job，至少覆盖 empty canvas、add menu、Script V2 三阶段、Storyboard、一个 failure/gate state，并上传 actual/diff/trace。 |
| CV-C5 | 复杂素材与剪辑的脚本链路 | video compositor 已有空态、有效媒体、编辑、导出、取消/重试等专项。 | Script V2 生成视频节点与剪辑入口之间缺少明确回归链；结果资产的 source metadata、时间线入口和失败重试可能漂移。 | P1 | 从 Script V2 materialized video 进入 storyboard/detail/clip editor，验证 source metadata、默认 timeline 规则、取消或失败不污染脚本节点。 |
| CV-C6 | Fixture 隔离与可诊断性 | Script V2 detailed spec 有 `beforeEach` scenario/reset；Playwright 默认单 worker、隔离服务。 | 核心与视觉分组扩展后，缺少每组 state reset、端口、数据目录、失败 artifact 的显式审计清单。 | P1 | 每个新增 spec 说明 scenario/reset、唯一 `DATA_DIR`、是否可并行；CI 失败统一保留 trace/report/服务日志，且不触碰 :3200 的演示服务。 |
| CV-C7 | 官网观察覆盖深度 | 现有截图/只读记录覆盖初始 Script V2 和 canvas 很多静态/可见状态。 | 官网当前版本的有效 Script V2 完成态、Text/Script 目录、Clip Editor 深度编辑仍缺合法只读证据；不应以猜测补齐。 | P2 | 仅在用户明确允许的已登录会话中做最小只读观察；每次先定义观察问题和停止条件，输出脱敏 AX/截图索引，不执行生成、下载、上传、发布或删除。 |

## 3. 建议的分层验收编排

### P0：把“已有能力”变成不可跳过的发布事实

1. **Script V2 semantic core**：从详细 spec 选择不依赖 screenshot 的最小代表例，控制运行时长；保留现有 `script-v2-core` 作为入口/阶段/disabled smoke。
2. **单条跨 surface journey**：新项目 → Script V2 手写或固定 fixture → materialize 一个产物 → Storyboard → source node；只使用原创 deterministic data。
3. **原子性与失败恢复**：以 route interception 或 fixture scenario 验证重复动作、取消、失败、retry、刷新，不以 sleep 作为完成判据。
4. **证据归档规则**：PR 描述/验收文档必须分别列出“官网直接观察”和“local contract”，禁止把 mock 的模型名、价格、状态文本标成官网行为。

P0 放行条件：隔离 `:3210` 的 CI core 每次运行上述旅程；任一失败能从 trace、API response 和 fixture scenario 复现；所有断言使用可访问 role/name 或稳定 test id，并同时检查一次持久化结果。

### P1：让交互与视觉达到演示可控

1. 建立 overlay/focus/keyboard state table，先固定 Script V2 和 canvas 高密度面板。
2. 增加 Script V2 × presence 的 revision conflict fixture 与恢复规则；不把协作状态写入 `WorkflowDocument`。
3. 选择固定 Linux 或 macOS visual runner 后，为既有 1440×900 状态建立独立 visual job；基线更新须附人工 review。
4. 将 Script V2 产物到 storyboard/clip editor 的 source identity、取消和失败恢复接入核心或变更路径门。

P1 放行条件：三次连续 isolated visual run 无随机 diff；关键 overlay 有 focus/Escape 断言；两 context 的 Script V2 冲突在不丢失可恢复本地草稿的前提下有确定结果。

### P2：仅以新官网事实驱动的精度提升

1. 用新增的最小只读官网观察补齐已授权且可见的状态，优先 Script V2 完成态、Text/Script 目录和 Clip Editor 编辑密度。
2. 将每个新事实映射到 local contract、fixture、E2E 和视觉基线；未知网络协议继续留给后端 API contract，不模拟为官网 endpoint。
3. 重新执行 [`GOAL_COMPLETION_AUDIT.md`](GOAL_COMPLETION_AUDIT.md) 的逐项判定，只有证据和自动化同时具备时才提高状态。

## 4. 验收用例清单（建议，不在本文执行）

| 用例 | 入口与动作 | 必须断言 | 建议层级 |
| --- | --- | --- | --- |
| AC-S01 | Script V2 三入口逐一打开并关闭 | 顺序、初始 enabled/disabled、Escape 只关闭顶层、焦点回到 trigger | core |
| AC-S02 | 手写一镜，编辑文本/时长/景别，拖拽排序 | 表格语义、边界 clamp、autosave 时机、reload 后稳定 shot ID/order | core |
| AC-S03 | 资产或提示词出现一项失败后 retry | 阶段计数、错误定位、成功项不回滚、重试不重复创建 | core |
| AC-S04 | 同一批 materialize 连续触发/刷新重进 | 单一原子 group、无重复 node/edge、cancel/failure 不写半成品 | core |
| AC-C01 | Script V2 一项产物 → Storyboard → 源节点 | 同一 document/revision 语义、source 定位、视图切换不复制数据 | core |
| AC-C02 | 两客户端并发编辑 Script V2 | lease/revision 冲突、草稿提示、refresh/retry 结果、无静默覆盖 | nightly/change-path |
| AC-C03 | empty canvas、Script V2 三阶段、gate/failure、Storyboard | 1440×900 approved screenshots + semantic assertions | visual |
| AC-C04 | Script V2 video → detail → clip editor → cancel/retry | source metadata、timeline 规则、取消/失败不污染 origin | nightly/change-path |

## 5. 最终判定规则

以下四项同时成立前，不应把 Script V2/canvas 表述为已完成“一比一交互复刻”验收：

1. 每个已声称的官网可见动作都有脱敏的直接观察证据，或明确标为 local-only；
2. 每个 local 状态机主路径都有 success、gate/empty、failure/retry 和 reload 证据；
3. main/tag 的浏览器门包含 Script V2 深度 semantic core 与至少一条 canvas→storyboard 组合旅程；
4. 固定平台 visual job 比对已批准的 1440×900 基线，并将任意 diff 连同 trace 交给人工审阅。

本计划与 [`REPLICATION_ACCEPTANCE_MATRIX.md`](REPLICATION_ACCEPTANCE_MATRIX.md) 和 [`GOAL_COMPLETION_AUDIT.md`](GOAL_COMPLETION_AUDIT.md) 配套使用：前两者描述产品面与总体目标，本文只负责将 Script V2/canvas 的“能力存在”收敛为可持续执行的验收门。

## 6. 2026-09-05 登录态只读 AX 补充观察

- **观察范围**：用户提供的已登录画布可访问性信息；仅用于确认控件层级、名称和 disabled 语义。
- **隐私边界**：不记录项目名称、项目/空间 ID、项目文本、提示词、素材、作者/账户标识、余额、Cookie、token 或任何网络请求。
- **禁止动作**：不点击生成、下载、上传、发布、删除、编辑，也不读取浏览器凭据。

| 分区 | 直接可见控件 / 状态 | 对验收计划的约束 |
| --- | --- | --- |
| 主工具栏 | `添加节点`、`移动`、`打开工具箱`、`素材库`、`角色库`、`生成历史`、`快捷键`、`教程`。 | AC-C01 的 canvas 起点应断言这些独立工具可访问，且不把 node selection 作为工具栏存在的前置条件。 |
| 底部状态轨 | `资产管理`、`整理画布`、`切换小地图`、`隐藏节点连线`、`网格吸附`、`缩放`。 | CV-C2 / visual gate 应把创建工具轨和视图状态轨分开验收；开关/缩放状态不得被 Script V2 局部面板关闭意外重置。 |
| Script V2 分步面板 | `确认镜头` → `准备资产` → `合成提示词`，属于同一运行的渐进阶段。 | CV-S2 必须断言阶段计数、前进 gate、回到已完成阶段和刷新恢复，而不是将三步实现为互不关联的页面。 |
| Script V2 摘要/节点级动作 | `批量生成分镜`、`批量生视频`、`下载`在前置未就绪时保持可见且 disabled。 | CV-S1/S2 的语义断言必须检验可见 + disabled + 可解释的前置条件；不得用隐藏按钮替代 gate。 |
| Script V2 镜头表 | 可见镜头拖拽、时长与描述编辑、景别、光影/对白/音效/运镜、最终提示词查看、行操作、`添加镜头`、`下一步`。 | AC-S02 应覆盖字段编辑、排序、持久化和可访问名称；AC-S03/04 应覆盖这些字段改变后对 prompt/asset/batch gate 的影响。 |

这份补充只提高**布局与交互存在性**的官网证据等级；它不增加对官网 API、异步任务、计费、权限、下载字节格式或失败恢复的任何断言。相关 local mock 仍须按本计划的 P0/P1 验收门独立证明。
