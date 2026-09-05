# Text / Script V2 证据审计

- 审计日期：2026-09-05
- 范围：Canvas 内的 **Text** 与 **Script V2** authoring，区分官网可观察事实、当前 frontend-only local mock、测试与视觉基线。
- 执行边界：本次只读。未执行官网生成、扣费、下载、发布、删除或上传；不记录 Cookie、账户、项目、节点、任务、素材 URL 或任何凭证。
- 术语：
  - **官网直接证据**：登录态可见 UI，或一次真实交互直接关联的脱敏请求 shape。
  - **bundle-confirmed**：从当前客户端 bundle 或 adapter 获得的 vocabulary；不是完整远端 API。
  - **本地已验证**：只证明本仓 deterministic fixture 的实现和测试。
  - **未证实**：没有充分官网直接证据，或没有对应 1440×900 视觉基线；不得被 local mock 升级为官网事实。

## 0. 可追溯入口

| 层 | Text | Script V2 |
| --- | --- | --- |
| 官网交互/协议记录 | [Text capture](../api/captures/2026-09-03-text-authoring.md)；[Canvas README 的文本节点](../pages/canvas/README.md#文本节点) | [Script V2 capture](../api/captures/2026-09-03-script-v2.md)；[Canvas README 的脚本节点](../pages/canvas/README.md#脚本节点)；[2026-09-04 只读抽屉复核](../pages/canvas/2026-09-04-live-project-readonly.md#2026-09-05-script-v2-阶段面板只读复核) |
| 官网页面截图 | <code>text-node-arranged-full-card.png</code>；官方指南补充 <code>text-node-purpose-and-generator.png</code> | <code>script-node-*.png</code> 与 <code>script-v2-*.png</code>，路径均见 [Canvas README](../pages/canvas/README.md#脚本节点) |
| local 状态/API | [TEXT_AUTHORING_STATE.md](../../../api/TEXT_AUTHORING_STATE.md)、<code>src/contracts/text.ts</code>、<code>src/domain/text-authoring.ts</code>、<code>src/domain/text-workflows.ts</code> | [SCRIPT_V2_STATE.md](../../../api/SCRIPT_V2_STATE.md)、<code>src/contracts/script-v2.ts</code>、<code>src/domain/script-v2*.ts</code>、<code>src/server/script-v2.ts</code> |
| UI / E2E | <code>TextNodeEditor.tsx</code>、<code>TextModelCatalog.tsx</code>、<code>e2e/text-editor.spec.ts</code> | <code>src/components/script/</code>、<code>e2e/script-v2.spec.ts</code>、<code>useScriptV2Runs.test.ts</code> |
| local 1440×900 baseline | <code>e2e/text-editor.spec.ts-snapshots/</code>，4 张 | <code>e2e/script-v2.spec.ts-snapshots/</code>，8 张 |
| 机器可读契约 | <code>docs/api/openapi.yaml</code> 的 <code>TextAuthoringState</code>、Canvas mutation、models/Text examples | 同一 OpenAPI 的 <code>/api/script-v2/*</code>、<code>ScriptV2State</code>、quote/run examples |

官网当前可直接观察的 <code>/api/canvas/nodes/batch</code>、<code>/api/task/generation/power/calculator</code> 与外部 envelope 仅是 adapter 证据；local 的 <code>/api/canvases/{canvasId}</code>、<code>/api/jobs</code>、<code>/api/script-v2/*</code> 是未来后端承接用的规范化 mock 契约，不能反向命名为 LibTV 已确认 API。

---

## 1. Text authoring

### 1.1 官网直接证据

| 能力 / 状态 | 直接观察结果 | 证据等级与边界 |
| --- | --- | --- |
| 空节点与入口顺序 | 空 Text 节点依次显示“自己编写内容 / 文生视频 / 图片反推提示词 / 文字生音乐”。 | interaction-linked；见 [capture](../api/captures/2026-09-03-text-authoring.md#ui-与状态事实) 与 [截图](../pages/canvas/screenshots/text-node-arranged-full-card.png)。 |
| 节点生成器 | 双击后为节点附着的深色浮层，约 660px；prompt、参考、模型、翻译、积分、生成同层；空输入不能运行。 | interaction-linked UI；证明布局和禁用门，不证明真实任务结果。 |
| 模型目录 | 顺序为 GVLM 3.1、CVLM 5.5、GVLM 3.1 Flash、Qwen 3 VL Flash；显示 10–20s 与说明。默认 GVLM 3.1 显示 6 积分。 | 目录、顺序、文案、默认项为直接 UI 事实；只有默认项的 6 积分已直接观察。 |
| 手写卡 | 约 350×200；有背景、H1/H2/H3、正文、粗/斜体、两类列表、分割线、复制、展开；空关闭态文案为“请编写内容，开始你的创作。” | interaction-linked UI；见 [capture](../api/captures/2026-09-03-text-authoring.md#ui-与状态事实)。 |
| Starter 图 | 三个动作各一次创建 Text→Video 的“预设 - 文生视频”、Image→Text 的“预设 - 图片反推提示词”、Text→Audio 的“预设 - 文字生音乐”；可见 Video/Audio 默认配置。 | interaction-linked；确认一次动作后的图拓扑，不含付费生成。 |
| 节点保存 | 手写 Text 触发 <code>POST /api/canvas/nodes/batch</code>；已脱敏确认 <code>projectUuid/nodes/connections/version/requestId/sessionId/timestamp</code> 与 <code>code/data/msg/trace_id</code>。手写节点投影包含 <code>type:1</code>、<code>text_resource</code>、<code>content[]</code>。 | shape-confirmed；外部 node schema 不是 local 持久化模型。 |
| 报价 | 修改生成配置时观察到 <code>POST /api/task/generation/power/calculator</code>，响应使用 <code>data.power</code>。 | shape-confirmed / interaction-linked；没有确认动态定价、扣费、生成、取消或结果协议。 |

### 1.2 本地已验证

| 项目 | 实现与自动化证据 | 验证强度 |
| --- | --- | --- |
| 生成器、模型目录、Escape | <code>e2e/text-editor.spec.ts</code> 断言 660px inverse scale、默认 placeholder/模型/6 积分、4 行目录顺序文案、逐层 Escape；覆盖 25/50/100% 缩放宽度。 | local E2E；与官网可见 UI 对齐。 |
| 生成偏好持久化 | E2E 覆盖 prompt、模型、翻译开关的 Canvas mutation 与 reload 恢复；<code>TextAuthoringState v1</code> 写入 <code>node.data.extra.textAuthoring</code>。 | local E2E + typed state。 |
| 安全手写文档 | <code>text-authoring.ts</code> 与 domain tests 约束 block tree、纯文本 paste、HTML 不持久化、background/marks/blocks 正规化；E2E 覆盖 12 个工具按钮、复制 toast、展开/ESC、刷新恢复。 | local domain + E2E。 |
| 三个 starter 原子性 | 对每个 starter 断言 node type、边方向、组名；一次 undo 删除整组。节点、边、组都通过同一 Canvas revision mutation。 | local E2E。 |
| Text Job / Storyboard | 覆盖 confirm gate、确定性 <code>.txt</code> 与 inline <code>textContent</code>、同一 artifact 投影到 Storyboard；document 编译为纯文本，generator 编译为 prompt。 | local E2E + domain contract；不证明官网 provider。 |
| 文档/API 交接 | <code>TEXT_AUTHORING_STATE.md</code>、Canvas mutation examples、models response example、OpenAPI 共同定义 normalized local consumer contract。 | 机器可读 local contract。 |

现有 1440×900 local 基线为：<code>text-node-editor-dark</code>、<code>text-model-catalog-dark</code>、<code>text-document-toolbar-dark</code>、<code>text-expanded-editor-dark</code>。它们锁定深色层级和工具栏密度，不代表官网逐像素相同。

### 1.3 未证实 / 缺失视觉基线

| 缺口 | 为什么仍是缺口 | 不应推断 |
| --- | --- | --- |
| 官网真实生成生命周期 | 未确认官网成功、队列、失败、取消、重试、扣费/返还或最终 Text 输出。 | local Job 的 confirm/retry 不能证明官网同一状态机。 |
| 非默认模型价格、配额、字符上限 | 仅默认 GVLM 3.1 的 6 积分有直接证据。 | fixture 的其他积分、provider ID、maxCharacters 不是官网事实。 |
| 翻译字段的远端投影 | 观察到 UI 偏好，没有对应的 shape-confirmed 请求字段。 | 不在外部 adapter 虚构 <code>translationEnabled</code> 参数。 |
| 官网富文本保存 schema | 工具栏与 plain <code>content[]</code> 可见，没有完整 blocks/marks/version 捕获。 | <code>TextAuthoringState v1</code> 是 local normalized design，不是官网 schema。 |
| Starter/undo 视觉回归 | starter topology 与 undo 有语义 E2E，但没有创建完成和 undo 后各自的 1440×900 baseline。 | JSON node/edge 断言不等于组框、连线和 viewport 的视觉验收。 |
| confirm/result/Storyboard 视觉态 | local 行为已覆盖，没有 Text 专项的确认门、成功 artifact 卡、Storyboard 文本列基线。 | DOM 文本断言不等于禁用态与信息层级正确。 |
| 缩放态视觉覆盖 | 非 100% 缩放只测宽度，没有浮层锚点、遮挡、层级截图。 | 不能声称所有缩放下视觉对齐。 |
| 展开编辑官网权益态 | 官网免费账户出现付费门，local fixture 展示完整能力。 | local 全能力不能描述为官网免费权益。 |

### 1.4 推荐后续 Text 验收条件

1. 在 1440×900 为三个 starter 的“创建完成”和“单次 undo 后”各建立基线；验收卡片、组框、端口、边、选中态、viewport。
2. 为 local Text Job 增补 <code>awaiting_confirmation → queued/running → succeeded | failed | cancelled → retry</code> 的 E2E；验证刷新恢复、artifact 不重复写入、quote/账本语义。
3. 冻结 Text confirm gate、成功 artifact 和 Storyboard 文本列基线，验证 <code>.txt</code> URL 与 <code>textContent</code> 同源且视图切换不产生 revision。
4. 新增 HTML paste、超长文档、重复 block ID consumer 场景，验证 normalize 或 route rejection，并覆盖空 document 与 background palette。
5. 在得到明确费用许可前，只继续非付费官网观察（翻译字段、非默认模型可见权益/价格）；真实成功/失败证据须先获许可。
6. 后端接入前以脱敏 batch capture 做 adapter contract test；认证、外部 envelope、provider fields 停留在 transport/adapter，绝不进入 <code>WorkflowDocument</code>。

---

## 2. Script V2 authoring

### 2.1 官网直接证据

| 能力 / 状态 | 直接观察结果 | 证据等级与边界 |
| --- | --- | --- |
| 三条入口 | 新版 Script 提供“剧本生成 / 角色生成 / 自己编写”；默认 GVLM 3.1，UI 成本 6。 | interaction-linked；见 [capture](../api/captures/2026-09-03-script-v2.md#ui-观察interaction-linked) 与 [入口截图](../pages/canvas/screenshots/script-node-default-generator-and-three-entry-paths.png)。 |
| 模型目录 | UI 显示 GVLM 3.1 Pro、CVLM 5.5、GVLM 3.1 Flash Lite 及约 10–20s latency。 | 直接 UI 事实；不证明 provider 价格、成功率或动态可用性。 |
| 三阶段与镜头表 | 从 Canvas 内打开底部抽屉式故事板，未离开画布；阶段为“确认镜头 / 准备资产 / 合成提示词”，可见完成/缺失计数。镜头表列为镜号、时长、画面描述、景别、光影氛围、对白·旁白、音效、运镜、最终提示词、操作。 | 2026-09-04 只读直接 UI；详见 [README 复核](../pages/canvas/README.md#2026-09-04-登录态-script-v2-抽屉复核)。 |
| Gate 与编辑性 | 当前不完整前置时，批量生成分镜、批量生视频、下载 disabled 而非隐藏；确认镜头保留添加镜头/下一步。时长、描述、景别、光影/对白/音效/运镜可编辑，镜头行可拖拽。 | interaction-linked / direct UI；计数不固化远端项目数据。 |
| 资产阶段 | 资产按 character / scene / prop；角色来源可为 AI、当前画布、本地上传；删除角色可选择保留分镜或移除角色和 <code>@</code> 引用。 | interaction-linked；证据截图见 [Canvas README](../pages/canvas/README.md#脚本节点)。 |
| 提示词阶段 | 支持单镜/批量智能或自动合成，分镜图与视频使用独立双轨提示词，缺前置时存在 gate。 | interaction-linked；没有真实 batch 成功证据。 |
| 保存与报价 | 节点动作见 <code>POST /api/canvas/nodes/batch</code>，报价见 <code>POST /api/task/generation/power/calculator</code> 的 <code>data.power</code>。 | shape-confirmed；外部 envelope/node data 不是 local state。 |
| scene/result vocabulary | <code>script-generate-v2</code>、<code>script-recompute-prompts-v2</code>、目标最多 20 镜/上下文最多 100 镜，以及 direct JSON 或 <code>texts[0]</code> JSON parser 分支。 | bundle-confirmed；不是完整官网 route、response、错误契约。 |

### 2.2 本地已验证

| 项目 | 实现与自动化证据 | 验证强度 |
| --- | --- | --- |
| 唯一状态与持久化 | <code>ScriptV2State v1</code> 独占 <code>node.data.extra.scriptV2</code>；rows/assets/stages/generator/prompt composer/batches 经过 strict schema 与 Canvas revision。 | local domain/contracts。 |
| 入口、生成器、缩放、Escape | E2E 覆盖三入口顺序、660px、3 模型/latency、嵌套 Escape、25/50/100% inverse scale。 | local E2E；对齐已观察 UI。 |
| 角色和手写入口 | 覆盖角色表单持久化 role asset/resource card、CSV UTF-8 BOM 下载/reload；手写入口创建一个 5 秒中景镜头并打开工作区。 | local E2E。 |
| 三阶段与 gate | 覆盖 stage metrics、表头、阶段转换、pending asset gate、ready 后 next enabled、双轨提示词详情及智能/自动模式。 | local E2E。 |
| 镜头和资产编辑 | 覆盖 5–15 秒 clamp、全景别、blur autosave、reorder/color/delete、三类资产、AI/canvas/upload/library 来源、source-aware menu、删除影响。 | local E2E + typed state。 |
| 批量与 stale 防护 | 覆盖 20+1 prompt serial batch、quote、局部/全选，batch asset 失败后继续，batch materialize 预览/原子 group/one undo；domain contract 记录 fingerprint、idempotency、stale writeback。 | local E2E + domain/server tests。 |
| local run API | <code>POST /api/script-v2/quotes</code>、create/get/transition 的 queued→running→succeeded、cancel/retry、409 idempotency，由 state doc、OpenAPI、server tests 锁定。 | local API contract；不是官网 path。 |

现有 1440×900 local 基线为：<code>script-v2-node-empty</code>、<code>script-v2-generator</code>、<code>script-v2-model-catalog</code>、<code>script-v2-shots</code>、<code>script-v2-assets</code>、<code>script-v2-prompts</code>、<code>script-v2-prompt-detail</code>、<code>script-v2-batch-image</code>。对照与刻意差异见 [script-v2-comparison.md](../../../visual/script-v2-comparison.md)。

### 2.3 未证实 / 缺失视觉基线

| 缺口 | 为什么仍是缺口 | 不应推断 |
| --- | --- | --- |
| 官网真实 run 生命周期 | 未观察远端 queued/running/succeeded/failed/cancelled/retry、轮询、真实资产、真实扣费/退款。 | 固定 local progression 不是官网状态机。 |
| 完整外部 Script API | scene vocabulary 仅 bundle-confirmed；官网直证只有 nodes batch/calculator shape。 | <code>/api/script-v2/*</code> 和 operation discriminator 不是官网 API。 |
| 成功态资源卡 / toolbar 的官网 gate | 只读证实不完整前置下禁用；local 角色路径可启用 batch image。 | local enabled 条件不能填补官网完成资产、完整 prompt、batch video、download 成功证据。 |
| run/error/retry 视觉回归 | 8 张基线覆盖主要编辑面，没有 queued/running/failed/cancelled/retry 或刷新恢复的基线。 | server transition test 不能替代用户可见状态层级。 |
| character/source/delete dialog 基线 | 有语义 E2E 和官网截图，但 local snapshot set 没有各 dialog/menu 稳定图。 | assets stage 单图不能证明 dialog 信息密度、disabled/focus 层级。 |
| batch video 与 materialize 成功/失败视觉态 | E2E 覆盖 video settings/confirm/one-undo；视觉基线只含 batch image dialog。 | 不能声称 batch video 已完成像素回归。 |
| 拖拽/长表视觉 | 行重排有行为断言，缺多镜头滚动、drag placeholder、sticky column baseline。 | state 行序正确不等于长表布局正确。 |
| 官网下载/CSV 协议 | 官网只观察到下载动作/disabled；local BOM/列/文件名是前端 fixture 设计。 | 不断言官网导出格式或副作用。 |
| 权益、审核、上传、源素材协议 | 官网证明入口存在，未走真实上传、审核、资产生成。 | fixture source/compliance 状态不是官网权限或上传协议。 |

### 2.4 推荐后续 Script V2 验收条件

1. 为 <code>generate-full</code>、<code>recognize-assets-only</code>、<code>recompute-prompts</code>、<code>generate-asset</code> 建立 create/running/succeeded/failed/cancelled/retry 的 local E2E；断言 idempotency、attempt、progress、stale discard、reload。
2. 在 1440×900 冻结 resource card、drawer、quote/error、cancel/retry、disabled reason、成功和失败重试状态，避免仅用 route JSON 证明 UI。
3. 新增 batch video 配置、confirm gate、materialized nodes/edges、one undo、失败不改写 Script 数据的视觉和交互契约，与 batch image 独立基线。
4. 为 AI/canvas/upload/library source dialog、delete impact、source-aware menu、pending/ready/failed asset card 增加稳定截图以及 keyboard focus/Escape 测试。
5. 用 21+ 行 fixture 覆盖 drawer 的横纵滚动、sticky final-prompt/actions、drag placeholder 与无障碍 reading order；同一镜头 ID 必须贯穿三阶段。
6. 继续官网只读观察完成/缺失计数、disabled reason、ESC/drawer 恢复；真实运行、导出、上传、审核需要事前明确许可。
7. 后端接入只替换 transport/provider。进入组件前必须通过 <code>ScriptV2State</code>、operation-discriminated schema、expectedRevision、idempotency/fingerprint/stale writeback；外部 envelope/认证/provider 扩展不写 Canvas。

---

## 3. 交接结论

1. **Text** 的直接证据足以支撑当前 local 的四入口、660px 生成器、模型目录、手写工具栏、三条 starter workflow 与保存/报价 adapter 边界；真实生成、计费、翻译请求字段和官方富文本 schema 未证实。
2. **Script V2** 的直接证据足以支撑三入口、底部三阶段抽屉、镜头字段、资产分类、前置 gate、双轨提示词；真实 run API、真实 batch 成功/失败、下载/上传/审核与权益语义未证实。
3. [TEXT_AUTHORING_STATE.md](../../../api/TEXT_AUTHORING_STATE.md)、[SCRIPT_V2_STATE.md](../../../api/SCRIPT_V2_STATE.md) 与 OpenAPI 是未来后端遵守的 **local normalized consumer contract**。外部官网 evidence 仅驱动 adapter/观察，不能覆盖 typed local state。
4. 已有静态编辑面基线为 Text 4 张、Script V2 8 张；下一轮优先补状态变化：Text confirm/result/Storyboard，以及 Script run/error/retry/batch-video/asset-dialog/long-table。
