# 官方只读能力布局 / 交互 → 本地验收追溯矩阵

- 基线：`main` 的本地前端与 deterministic local mock；记录日期：2026-09-05。
- 用途：把已归档的 LibTV 可见 UI 证据，逐项追溯到本地路由、组件、浏览器验收和 API 契约文档；它是后续只读校准与 `1440×900` 视觉放行的索引，不是官网 API 清单。
- 隐私与只读边界：本文件只引用仓内既有的脱敏观察和原创 fixture。没有访问登录会话、网络面板、Cookie、token、账户/项目内容、素材或提示词；没有执行官网写操作。
- API 边界：下文出现的 `/api/**` **全部是本仓 local mock Route Handler**。它们的请求/响应、任务进度、报价、计费、权限和错误语义仅是可替换的本地契约，绝不作为 LibTV 官方 API、字段或远端行为的断言。

## 状态口径

| 状态 | 可审计含义 | 不表示 |
| --- | --- | --- |
| **已验证** | 现有只读可见证据可支撑该布局/基础交互存在性，且本地 route、组件、E2E 与 API 文档均有可定位的对应项。 | 不表示远端 API、付费、长任务、权限或未观察完成态已得到验证。 |
| **待官方只读校准** | 本地能力和验收入口已存在，但官网当前可见状态、层级、disabled 原因、焦点恢复或完成态仍缺直接脱敏观察。 | 不得从 local mock 的文案、状态机或模型目录反推官网行为。 |
| **待视觉基线** | 本地语义与交互已有测试，但该特定 `1440×900` 状态尚未成为固定平台、人工审阅的发布基线。 | 不表示用现有截图或绿色语义 E2E 即可宣称视觉一比一。 |

## 追溯矩阵

| ID | 能力布局 / 可逆交互 | 官网只读依据与明确未知项 | 本地 mock 路由（仅 local） | 组件 / 本地状态边界 | E2E 入口 | API 文档 | 状态与下一步证据 |
| --- | --- | --- | --- | --- | --- | --- |
| M-01 | 独立全屏画布 chrome；顶部项目/画布与 `Workflow / Storyboard` 切换；底部视图工具轨。 | `pages/canvas/README.md`、`pages/canvas/2026-09-04-live-project-readonly.md` 与 2026-09-05 AX 补充观察记录了可见分区；不推断切换时远端 revision 或协作同步。 | `GET/POST /api/canvases/{canvasId}`；`GET/POST /api/presence/{canvasId}`。 | `src/components/canvas/CanvasWorkspace.tsx`、`TopBar.tsx`、`BottomToolbar.tsx`、`src/lib/editor-store.ts`。 | `e2e/canvas-parity.spec.ts`（shell、切换、刷新）；`e2e/workflow.spec.ts`。 | [`ROUTE_COVERAGE.md`](../../api/ROUTE_COVERAGE.md)、[`WORKFLOW_CONCURRENCY.md`](../../api/WORKFLOW_CONCURRENCY.md)、[`PRESENCE_EDITOR_LEASE.md`](../../api/PRESENCE_EDITOR_LEASE.md)。 | **已验证**；保持视图切换不产生第二份 `WorkflowDocument` 的断言。 |
| M-02 | 添加节点菜单、节点/边选择、工具箱与键盘关闭路径。 | `pages/canvas/README.md` 和画布/添加节点脱敏截图记录 taxonomy 与可访问入口；未观察到所有菜单项的远端写入后果。 | `POST /api/canvases/{canvasId}`。 | `WorkflowCanvas.tsx`、`NodeCard.tsx`、`LibraryPanels.tsx`、`shortcuts.tsx`；`src/domain/mutations.ts`。 | `e2e/canvas-parity.spec.ts`（菜单、键盘、节点/边）；`e2e/workflow.spec.ts`。 | [`ROUTE_COVERAGE.md`](../../api/ROUTE_COVERAGE.md)、[`openapi.yaml`](../../api/openapi.yaml)。 | **已验证**；新增 menu 项时同时添加 route-manifest、契约和可访问断言。 |
| M-03 | 画布 revision、刷新恢复、双客户端 presence/follow 与编辑租约。 | 既有只读资料只覆盖可见协作布局/入口；冲突提示、重连和租约时序不是官网事实。 | `GET/POST /api/canvases/{canvasId}`；`GET/POST /api/presence/{canvasId}`。 | `PresenceLayer.tsx`、`CanvasWorkspace.tsx`、`src/server/presence.ts`、`src/lib/presence-client.ts`。 | `e2e/presence-concurrency.spec.ts`、`e2e/script-v2-conflict-core.spec.ts`。 | [`PRESENCE_EDITOR_LEASE.md`](../../api/PRESENCE_EDITOR_LEASE.md)、[`WORKFLOW_CONCURRENCY.md`](../../api/WORKFLOW_CONCURRENCY.md)。 | **待官方只读校准**；仅在允许的可逆观察中记录可见冲突/follow 层级，不操作共享画布。 |
| M-04 | Script V2 三阶段、十列表格、三个入口、`Escape` 分层关闭，以及未就绪时仍可见的批量/下载 gate。 | `pages/canvas/2026-09-05-script-v2-ax-contract.md` 与 `SCRIPT_V2_CANVAS_INTERACTION_ACCEPTANCE_PLAN.md` §6 已直接记录初始布局、按钮名称与 disabled 语义；不主张完成态、真实下载或计费。 | `POST /api/script-v2/quotes`；`POST/GET /api/script-v2/runs/{runId}`；`POST /api/canvases/{canvasId}`。 | `src/components/script/ScriptV2Workspace.tsx`、`ScriptV2ShotTable.tsx`、`ScriptV2Dialogs.tsx`、`useScriptV2Runs.ts`。 | `e2e/script-v2-core.spec.ts`、`e2e/script-v2-entry-focus-core.spec.ts`。 | [`SCRIPT_V2_STATE.md`](../../api/SCRIPT_V2_STATE.md)、[`examples/script-v2-state.json`](../../api/examples/script-v2-state.json)。 | **已验证**；保留“可见 + disabled + 前置解释”而非隐藏操作的断言。 |
| M-05 | Script V2 完成阶段计数、批量分镜/视频、下载入口及失败→重试投影。 | 覆盖计划 P0-01 指出官网只直接证实“不完整”门；完成态、真实异步、下载格式、计费与失败文案尚未观察。 | `POST /api/script-v2/quotes`；`POST/GET /api/script-v2/runs/{runId}`；`POST /api/canvases/{canvasId}`。 | `ScriptV2Workspace.tsx`、`ScriptV2Assets.tsx`、`ScriptV2Prompts.tsx`、`src/domain/script-v2*.ts`。 | `e2e/script-v2-prompt-state-core.spec.ts`、`e2e/script-v2-recovery-core.spec.ts`、`e2e/script-v2-materialize-idempotency-core.spec.ts`。 | [`SCRIPT_V2_STATE.md`](../../api/SCRIPT_V2_STATE.md)、[`JOB_STATES.md`](../../api/JOB_STATES.md)。 | **待官方只读校准**；按 `OFFICIAL_READONLY_EVIDENCE_COVERAGE_PLAN.md` 的 P0-01 只读取已有卡片/菜单和 disabled 原因。 |
| M-06 | Script V2 长镜头表的 sticky 列、横纵滚动、行菜单、焦点返回与排序占位。 | 覆盖计划 P0-02 明确该表的可见几何与关闭后焦点仍缺；不得用 local 拖拽实现补全官网交互。 | `POST /api/canvases/{canvasId}`。 | `ScriptV2ShotTable.tsx`、`ScriptV2Workspace.tsx`、`src/domain/script-v2.ts`。 | `e2e/script-v2-reorder-core.spec.ts`、`e2e/script-v2-entry-focus-core.spec.ts`、`e2e/script-v2-durability-core.spec.ts`。 | [`SCRIPT_V2_STATE.md`](../../api/SCRIPT_V2_STATE.md)。 | **待官方只读校准**；观察仅限现有表容器、列头、一个只读 detail/菜单与一次 `Escape`。 |
| M-07 | Text 节点生成器、模型目录、翻译/引用展示层、确认前 gate 与刷新恢复。 | 覆盖计划 P0-04 指出当前条目顺序、默认选择、显示字段和 gate 仍需验证；local 四行目录与费用/延迟字段不被提升为官网事实。 | `GET /api/models?media=text`；`POST/GET /api/jobs{/{jobId}}`；`POST /api/canvases/{canvasId}`。 | `TextNodeEditor.tsx`、`src/components/text/TextModelCatalog.tsx`、`src/domain/text-authoring.ts`。 | `e2e/text-editor.spec.ts`。 | [`TEXT_AUTHORING_STATE.md`](../../api/TEXT_AUTHORING_STATE.md)、[`MATERIAL_CATALOG.md`](../../api/MATERIAL_CATALOG.md)、[`JOB_STATES.md`](../../api/JOB_STATES.md)。 | **待官方只读校准**；只展开展示层并记录可见名称/禁用语义，不改变模型、偏好或输入。 |
| M-08 | Workflow 与 Storyboard 共享文档；媒体卡详情、筛选、源节点定位入口和关闭层级。 | `pages/canvas/README.md`、现有 storyboard 脱敏截图和覆盖计划 P0-05 支撑布局/入口；真实定位是否改变远端选择、Agent 引用及复制副作用未观察。 | `GET/POST /api/canvases/{canvasId}`；`GET /api/media/{path}`。 | `src/components/storyboard/StoryboardView.tsx`、`MediaDetailDrawer.tsx`、`src/domain/storyboard.ts`。 | `e2e/canvas-parity.spec.ts`、`e2e/script-v2-storyboard-core.spec.ts`。 | [`ROUTE_COVERAGE.md`](../../api/ROUTE_COVERAGE.md)、[`ASSET_LIFECYCLE.md`](../../api/ASSET_LIFECYCLE.md)。 | **已验证**；持续断言切换/详情关闭不会复制文档或无意增加 revision。 |
| M-09 | Storyboard 的默认/展开列、筛选菜单、Agent 旁路与 populated `1440×900` 密度。 | 官网截图已有可比对的静态层次，但验收计划 CV-C4 指出固定平台 visual job 尚未建立。 | `GET /api/canvases/{canvasId}`；`GET /api/media/{path}`。 | `StoryboardView.tsx`、`MediaDetailDrawer.tsx`。 | `e2e/canvas-parity.spec.ts`（语义和现有截图断言）。 | [`ROUTE_COVERAGE.md`](../../api/ROUTE_COVERAGE.md)。 | **待视觉基线**；在固定浏览器/字体平台归档默认、展开、detail/failure 三种 approved `1440×900` 基线。 |
| M-10 | Clip Editor 空时间线、source rail、转场/字幕面板和导出 disabled gate。 | `pages/canvas` 中的空时间线、转场、字幕和导出门截图已记录；当前语义测试存在，但尚无固定平台的发布 visual lane。 | `POST /api/compose`；`GET/POST /api/compose/{taskId}`；`GET /api/media/{path}`。 | `src/components/storyboard/ClipEditor.tsx`、`src/domain/composite.ts`。 | `e2e/video-compositor.spec.ts`、`e2e/clip-editor-core.spec.ts`。 | [`COMPOSE_LIFECYCLE.md`](../../api/COMPOSE_LIFECYCLE.md)、[`ASSET_LIFECYCLE.md`](../../api/ASSET_LIFECYCLE.md)。 | **待视觉基线**；基线至少覆盖空态、打开转场、打开字幕与 export gate，截图不包含用户媒体。 |
| M-11 | Clip Editor 有效时间线、选中态、裁切/分割/音轨、成功/失败/取消和刷新恢复。 | 覆盖计划 P0-03 说明现有官网直接证据主要为空态/入口；有效媒体的时间线密度、导出可用性和层级仍待只读观察。 | `POST /api/compose`；`GET/POST /api/compose/{taskId}`；`GET /api/media/{path}`。 | `ClipEditor.tsx`、`src/domain/composite.ts`、`src/server/compose.ts`。 | `e2e/clip-editor-core.spec.ts`、`e2e/compositor-reliability.spec.ts`、`e2e/video-media-interaction-core.spec.ts`、`e2e/script-v2-video-editor-core.spec.ts`。 | [`COMPOSE_LIFECYCLE.md`](../../api/COMPOSE_LIFECYCLE.md)、[`ROUTE_COVERAGE.md`](../../api/ROUTE_COVERAGE.md)。 | **待官方只读校准**；只读取已有编辑器的轨道/面板/导出菜单，禁止播放、seek、拖拽、裁切、应用或导出。 |
| M-12 | 资产侧栏、个人/Agent 空态、筛选与素材详情的布局边界。 | 既有脱敏截图支持入口、空态和分区；个人素材、上传、筛选结果与批量操作均不进入新观察记录。 | `GET /api/assets`；`GET /api/assets/folders`；`GET /api/media/{path}`。 | `src/components/canvas/AssetSidebar.tsx`、`LibraryPanels.tsx`、`src/components/assets/AssetLibraryPanel.tsx`。 | `e2e/workflow.spec.ts`（资产入口/详情）；相关组件单测。 | [`ASSET_LIFECYCLE.md`](../../api/ASSET_LIFECYCLE.md)、[`ASSET_INGESTION.md`](../../api/ASSET_INGESTION.md)。 | **待视觉基线**；以原创空 fixture 固定个人资产、Agent 资产和详情三张 `1440×900` 基线。 |
| M-13 | 图像/视频/音频节点的生成确认门、任务状态、失败/取消/重试与账本投影。 | 已有只读页面可证明部分入口和 gate；真实任务、成本、额度、权限、长轮询与终态一律未知。 | `POST/GET /api/jobs{/{jobId}}`；`POST /api/canvases/{canvasId}`；`GET /api/models`。 | `ImageNodeEditor.tsx`、`VideoNodeEditor.tsx`、`AudioNodeEditor.tsx`、`ConfirmGate.tsx`、`src/server/generation/*`。 | `e2e/generation-ledger-lifecycle.spec.ts`、`e2e/workflow.spec.ts`。 | [`JOB_STATES.md`](../../api/JOB_STATES.md)、[`VIDEO_REFERENCE_STATE.md`](../../api/VIDEO_REFERENCE_STATE.md)、[`AUDIO_AUTHORING_STATE.md`](../../api/AUDIO_AUTHORING_STATE.md)。 | **待官方只读校准**；保持 deterministic local lifecycle 与官网可见事实分栏，不记录或模拟官方请求。 |

## 审计规则与维护动作

1. **证据前置**：状态只能由本矩阵引用的仓内证据提升。新增官网事实先写明观察范围、可见控件、前置状态和停止条件；未知项保持“待官方只读校准”。
2. **本地契约前置**：新增或变更 local route 时，同步更新 `src/contracts/route-manifest.ts`、`docs/api/openapi.yaml`、相应 API 文档/示例与至少一个 route 或 E2E 断言；不得把本地路径命名为官网 endpoint。
3. **视觉前置**：把“待视觉基线”提升为“已验证”前，需在同一固定平台连续三次通过目标 `1440×900` 截图，人工审阅 approved baseline，并保留 trace/diff；此项遵循 `SCRIPT_V2_CANVAS_INTERACTION_ACCEPTANCE_PLAN.md` 的 CV-C4/CV-C6 约束。
4. **隐私前置**：研究记录只保留通用 UI 标签、角色、disabled/可见状态、相对布局与原创 fixture 标识。项目名、账户资料、余额、素材、提示词、URL 参数、Cookie、token 和网络 payload 不写入本文件或相关 baseline。

## 关联来源

- [`OFFICIAL_READONLY_EVIDENCE_COVERAGE_PLAN.md`](OFFICIAL_READONLY_EVIDENCE_COVERAGE_PLAN.md)：下一轮只读观察问题、允许动作和硬停止条件。
- [`GOAL_COMPLETION_AUDIT.md`](GOAL_COMPLETION_AUDIT.md)：总体目标与本地 mock/API 交付缺口的判定。
- [`SCRIPT_V2_CANVAS_INTERACTION_ACCEPTANCE_PLAN.md`](SCRIPT_V2_CANVAS_INTERACTION_ACCEPTANCE_PLAN.md)：Script V2、canvas、Storyboard 与 visual gate 的可执行验收计划。
- [`REPLICATION_ACCEPTANCE_MATRIX.md`](REPLICATION_ACCEPTANCE_MATRIX.md)：全产品 surface 的既有复刻验收矩阵；本文件只收敛官网只读事实到 local canvas/script/text/storyboard/clip-editor 验收链。
