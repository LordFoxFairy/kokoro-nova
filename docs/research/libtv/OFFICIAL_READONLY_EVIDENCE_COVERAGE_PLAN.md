# 官网只读事实覆盖计划（下一次登录态观察）

- 制定日期：2026-09-05
- 目的：在**一次已授权的登录态、仅可见 UI 观察**中，收集当前高保真复刻仍缺的布局、交互层级、disabled gate 与可见状态事实；为 local mock、1440×900 基线和后端交接契约提供可追溯输入。
- 不是授权范围：不执行真实生成、充值/购买、上传、下载、发布、分享、收藏、复制、邀请、删除、项目重命名、设置修改或任何可能写入远端状态的动作；不读取开发者工具、网络请求、Cookie、Token、二维码、Access Key、私有素材 URL、项目名称、提示词、人物/资产名称或账户标识。
- 事实等级：本计划采集到的是 **E3 登录态可见 UI 事实**。它可更新页面观察、局部状态机和视觉验收，不能把 local `/api/**`、OpenAPI 或 mock 的字段升级成“官网真实 API”。若未来需要网络/API 契约，必须另行取得仅观察网络层的明确授权，并单独记录脱敏和停止边界。

## 1. 本轮完成定义

本轮不是“把官网所有流程走完”。完成只指下列目标全部达成：

1. P0 项获得每个目标状态的可见控件、可访问名称/禁用语义、打开/关闭路径和 `1440×900` 布局事实；不能打开的项记录实际阻断，而不是以推断补全。
2. 每个观察项均能映射到一个 local surface、至少一个现有或待新增的 Playwright 入口，以及一个研究/验收文档落点。
3. 所有记录采用去标识化描述：只记录静态标签、控件角色、状态、相对布局和产品通用文案；不记录项目或账户内容。
4. 观察结束时返回原先页面/视图，确认没有待提交的编辑、toast、任务或弹层；若无法确认，立即停止并请用户人工决定。

下列事实**不会**在本轮被强行收集：真实任务成功/失败/取消、付费扣费/返还、上传限制的服务端响应、导出文件、远端 API payload/response、团队/邀请生命周期。这些仍应在文档中维持 `未证实`，直到获得更高范围授权。

## 2. 统一低风险动作与硬停止条件

### 允许的统一动作

以下动作仅用于呈现已存在界面，并且每次动作后先核对是否出现会写入的确认按钮或 toast：

- 在当前已登录窗口内进行 URL/侧栏导航，或在已打开的画布中切换 **Workflow / Storyboard**；
- 打开已有节点、既有媒体详情、模型/来源/筛选/更多菜单、tab、折叠面板或帮助 tooltip；
- 以 `Escape`、关闭图标或“取消”关闭刚打开的可逆 overlay；
- 在不提交的前提下聚焦已有控件，读取其可访问名称、`disabled`、placeholder、aria 提示和键盘焦点可达性；
- 仅当用户确认可以保存产品界面时，截取去标识化的 `1440×900` 可见屏幕；截图前遮挡/裁掉私有项目名、资产缩略图、账户资料、余额和输入内容。

### 一律不做

- 不输入/粘贴 prompt、搜索词、名称、评论或表单值；不选择会改变已保存配置的模型、角色、资产、时间线条目、偏好或主题。
- 不点击任何含“生成、运行、确认、下一步、批量、上传、下载、导出、发布、保存、应用、删除、恢复、复制、喜欢、分享、邀请、购买、支付、续费、开通”的有效操作；disabled 控件只读其禁用状态，不尝试绕过。
- 不拖拽镜头、片段、轨道、滑块、卡片、资产或余额池；不播放媒体、不发送 Agent 消息、不退出登录、不新开匿名会话。
- 不打开浏览器开发者工具、不复制响应/页面源，不记录网络端点、请求体、响应体或任何凭据。

### 任一触发即停止

| 触发信号 | 立即动作 | 记录方式 |
| --- | --- | --- |
| 出现“确认/保存/提交/运行/扣费/上传/下载/发布”等可能执行动作 | 不点击；`Escape`/关闭；返回上层 | 仅记录该 gate 可见及标签，不记录表单/私有内容。 |
| 显示积分、价格、余额、订阅或配额 | 不操作相关组件 | 只写“存在/disabled/需要权益”这一类通用事实；不保存数值。 |
| 出现私有项目名、素材、人物、提示词、头像、UUID 或账户详情 | 停止截图与文字转录，关闭/返回 | 在日志中只记“私人内容被遮挡，未采集”。 |
| UI 行为不确定是否写入，或出现 toast/加载/任务进度 | 停止该项，不尝试重复或恢复 | 标记 `blocked-by-write-risk`，由用户决定是否扩展授权。 |
| 页面要求重新登录、验证码、第三方授权或跳转外部域 | 不继续认证、不提交 | 记为 `auth/external boundary`，保留当前结论。 |

## 3. 一轮执行顺序

按下表的 P0 → P1 顺序执行。每项只采集“首次打开态、一个可逆子层、关闭后焦点/层级”，避免在同一页面反复操作。若时间有限，至少完成 P0-01 至 P0-05；这些正对应当前目标中 Video、Script、Text 与 Canvas 的直接证据缺口。

| 优先级 / 观察问题 | 仍缺的官网事实 | 允许的低风险可见交互 | 停止条件 | local surface / 验收映射 | 观察记录落点 |
| --- | --- | --- | --- | --- | --- |
| **P0-01 Script V2 完成态 gate** | 当镜头、资产、双轨提示词处于不同完成度时，三阶段计数、批量分镜/视频、下载的可见 disabled 原因与工具栏位置；当前只直接证实“不完整”门。 | 在**已有** Script V2 节点中打开抽屉；切换“确认镜头 / 准备资产 / 合成提示词”；打开一条提示词详情与一个纯菜单/tooltip 后关闭。只读已有卡片的 ready/pending/failed 文案。 | 任一“下一步/确认/批量/下载”变为可执行，或打开动作要求确认/写入，即不点击。不得编辑镜头、添加资产、拖拽行。 | `src/components/script/ScriptWizard.tsx`、`src/domain/script-v2*.ts`；`e2e/script-v2-core.spec.ts`、`script-v2-prompt-state-core.spec.ts`、`script-v2-materialize-idempotency-core.spec.ts`；补充 `e2e/script-v2.spec.ts` visual state。 | `pages/canvas/README.md` 的 Script V2 段；`pages/canvas/2026-09-05-script-v2-ax-contract.md`；`audits/text-script-evidence-audit.md` §2.3；`SCRIPT_V2_CANVAS_INTERACTION_ACCEPTANCE_PLAN.md`。 |
| **P0-02 Script V2 长表 / 焦点层级** | 长镜头表的 sticky column、横纵滚动、drag placeholder、行菜单与 `Escape` 后焦点归属；现有 local 仅有有限行与部分入口层级。 | 若已有多镜头表，滚动容器本身、横向查看末尾列；打开一行“最终提示词”详情或行菜单，随后 `Escape` 一次并观察焦点/选中恢复。 | 不能确认滚动/焦点不会修改，或仅有私人镜头内容可见时，停止并只记录容器/列头几何。不得拖拽、排序、编辑。 | `ScriptWizard.tsx`；`e2e/script-v2-entry-focus-core.spec.ts`、`e2e/script-v2-durability-core.spec.ts`、`e2e/script-v2-conflict-core.spec.ts`。 | `pages/canvas/README.md`；`audits/text-script-evidence-audit.md` 的 long-table / dialog gap；`SCRIPT_V2_CANVAS_INTERACTION_ACCEPTANCE_PLAN.md`。 |
| **P0-03 Clip Editor 有效时间线事实** | 已有素材时 source rail、时间线轨道、选中态、转场/字幕面板、导出可用性及层级；当前直接证据主要是空态和入口。 | 从**已有**视频 Storyboard 卡打开编辑器；只读 source rail 与既有时间线；切换“转场”“字幕/文本”等只读 tab，打开导出菜单但不选择目标；用 `Escape` 按层关闭。 | 任意“添加素材/应用/导出/渲染/保存”或拖拽/播放器动作可能写入时不执行。不得播放、seek、裁切、分割、改速度、改字幕或改音量。 | `src/components/storyboard/ClipEditor.tsx`、`src/domain/composite.ts`；`e2e/video-compositor.spec.ts`、`e2e/compositor-reliability.spec.ts`、`e2e/script-v2-video-editor-core.spec.ts`。 | `pages/canvas/README.md` Storyboard/Clip Editor 段；`audits/clip-editor-evidence-audit.md` CE-01/CE-04/CE-06；`visual/video-compositor-comparison.md`。 |
| **P0-04 Text 节点目录和 gate** | 当前 Text 模型目录的条目顺序、默认选择、可见价格/延迟字段、翻译/引用门、确认前的 disabled 提示；非默认模型和服务端字段仍未证实。 | 打开已有 Text 节点和生成器；展开模型目录和参考/翻译的**展示层**，不变更任何选择；用 `Escape` 逐层关闭。 | 若展开即改写已选模型/偏好、出现确认/计费/运行 UI，立即关闭；不输入 prompt、不点生成。 | `TextNodeEditor.tsx`、`TextModelCatalog.tsx`、`src/domain/text-authoring.ts`；`e2e/text-editor.spec.ts`。 | `pages/canvas/README.md` Text 段；`api/captures/2026-09-03-text-authoring.md`；`audits/text-script-evidence-audit.md` §1.3。 |
| **P0-05 Canvas ↔ Storyboard 同文档与媒体详情** | 切换视图是否保留选择、顶部/底部 chrome、卡片详情里的来源定位和关闭层级；不依赖本地 reducer 推断官网 revision。 | 从既有画布在 Workflow / Storyboard 间切换；打开一个已有媒体详情，读取“在工作流中定位”等入口是否存在，再关闭，不实际定位；可打开但不切换筛选菜单。 | 若点击定位、复制、Agent 引用会改变选择/会话/数据，就不点击；不创建节点、编辑画布、修改筛选或打开分享。 | `CanvasWorkspace.tsx`、`WorkflowCanvas.tsx`、`StoryboardView.tsx`、`MediaDetailDrawer.tsx`；`e2e/canvas-parity.spec.ts`、`e2e/script-v2-storyboard-core.spec.ts`。 | `pages/canvas/2026-09-04-live-project-readonly.md`；`REPLICATION_ACCEPTANCE_MATRIX.md` C-01..C-05 / S-01..S-03；`visual/canvas-workflow-comparison.md`。 |
| **P0-06 Asset / source capability boundaries** | 当前资产侧栏的分类、空/已有态、筛选、来源标识、不可用/合规文案与上传入口 preflight；完整上传和服务端限制仍不在本轮范围。 | 打开资产侧栏、只读分类/筛选/搜索 placeholder/空态；打开上传入口的**第一层**仅当未选择文件且没有开始上传按钮自动激活，随后关闭。 | 出现文件选择器、拖拽区域已接收文件、上传确认、删除/恢复、批量动作或权限提示时停止。 | `LibraryPanels.tsx`、`AssetSidebar.tsx`、`src/components/assets/*`；`e2e/material-catalog.spec.ts`、`e2e/character-library.spec.ts`。 | `pages/models-assets/README.md`；`flows/asset-editing.md`；`audits/frontend-capability-gap-audit.md` P1-03。 |
| **P1-01 Agent 可见状态机边界** | 空输入/上下文工具、模型/Skill chooser、`ask_human`、额度 gate、历史/分享入口的可见层级；真实消息运行仍排除。 | 打开 Agent 面板或既有会话的只读区域；展开模型或 Skill chooser，读取禁用发送/关闭层级；只读已有 `ask_human` 牌或空态。 | 不输入、不发送、不回答问题、不选择模型/Skill、不重命名、不分享；有消息草稿、确认或额度操作即关闭。 | `AgentPanel.tsx`、`src/server/agent.ts`；`e2e/interaction-contracts.spec.ts`、`e2e/home-project.spec.ts`。 | `pages/agent/README.md`；`flows/web-agent-creation.md`；`audits/frontend-capability-gap-audit.md` P0-01/P1-04。 |
| **P1-02 登录态 Skills 市场 / 作者边界** | 已登录时 Skill/收藏/我的的空态差异、顶部 composer 的上下文入口、详情“使用”门与作者入口的第一层信息架构。 | 导航 `/skill`；仅切换可读 tab/分类，打开一个详情、轮播或作者入口第一层后退出；读取 disabled/empty/permission 文案。 | 不收藏、不使用、不创建/编辑/发布、不搜索、不分享；表单、文件选择、提交、认证重定向或任何 prefilled 私人内容出现即停止。 | `src/components/skills/*`；`e2e/skills-parity.spec.ts`、`e2e/skills-authoring.spec.ts`。 | `pages/skills/README.md`；`flows/skill-driven-creation.md`；`audits/frontend-capability-gap-audit.md` P1-04。 |
| **P1-03 Account / billing / team 可见边界** | 菜单层级、会员/积分/存储摘要的存在、消耗顺序入口、团队 entitlement/创建 gate、通知与外部 handoff 文案。 | 仅打开头像菜单、账户/会员的只读摘要和“消耗顺序”第一层说明弹窗，随后关闭；不改变 theme/水印/通知。 | 出现数值、Access Key、团队成员、购买、开票、外部域、拖拽顺序或可保存开关时，停止该子项并不转录数值。 | `src/components/account/*`、`LocalIdentityMenu`；`e2e/account.spec.ts`、`e2e/account-identity.spec.ts`、`e2e/generation-ledger-lifecycle.spec.ts`。 | `pages/account/README.md`；`pages/billing/README.md`；`flows/billing-and-subscription.md`；`REPLICATION_ACCEPTANCE_MATRIX.md` A-01..A-05。 |
| **P1-04 Project / canvas management edge states** | 项目卡/画布 switcher 的只读菜单结构、回收站/分页/新窗口和空态的当前文案；当前本地 lifecycle 比官网细节证据更完整。 | 在不创建的前提下打开项目卡或画布切换菜单，读取已有菜单项/disabled 语义后关闭；只导航到现有只读列表/空态。 | 禁止新建、重命名、移动、复制、删除、恢复、永久删除、打开新窗口；任何 prompt/input 或确认门出现均停止。 | `ProjectListPage.tsx`、`TopBar.tsx`；`e2e/project-manager.spec.ts`、`e2e/project-lifecycle.spec.ts`、`e2e/recycle-bin.spec.ts`。 | `pages/home/README.md`、`pages/canvas/README.md`；`PAGE_GAP_CHECKLIST.md` Project 段。 |
| **P1-05 TV Show 公开作品和登录差异** | 登录会话下公开发现入口、制作过程只读门、播放器控制/字幕多音轨入口是否可见、已登录复制/互动的确认前信息。 | 仅导航公开 TV Show、打开详情和未播放的控制/设置菜单，切换到制作过程的只读 view；不启动媒体。 | 不播放、不点赞、不分享、不复制、不提交搜索；任何确认、登录/外部域、媒体加载或作业状态出现即停止。 | `src/components/showcase/*`、`PublicCanvasView.tsx`；`e2e/public-discovery.spec.ts`、`e2e/showcase-interactions.spec.ts`。 | `pages/showcase/README.md`；`flows/showcase-clone.md`；`visual/2026-09-04-public-discovery-fidelity-audit.md`。 |
| **P1-06 Public/anonymous boundary（需单独明确允许）** | 访客首页、登录层、二维码过期、公开详情 URL 与登录后 return-to 差异。已有登录会话不能作为访客态证据。 | **仅在用户明确允许另开隔离匿名窗口时**：导航公开首页、打开登录层、切换手机号/扫码 tab、观察过期/关闭层；不输入手机号/验证码，不扫描二维码。 | 当前登录会话不得登出；若隔离窗口不存在或触发任何认证输入/外部域，停止。 | `HomePage.tsx`、`LocalReturnToSchema`；`e2e/home-project-return-to.spec.ts`、`e2e/public-discovery.spec.ts`。 | `pages/home/README.md`、`pages/home/2026-09-04-public-surface.md`、`pages/home/2026-09-05-public-home-continued-readonly.md`；`REPLICATION_ACCEPTANCE_MATRIX.md` H-05。 |

## 4. 每项最小事实记录模板

每项执行后只记录下列字段；任意私人字段用 `[REDACTED]`，而不是摘录或替换为可回溯的描述。

```md
## <OBS-ID> <surface> — <YYYY-MM-DD>

- 会话/边界：已有登录态；只读 UI；未触发网络/任务/账户写入。
- 入口：<通用导航路径，不含项目 ID、项目名或个人资产名>。
- 视口：1440×900 CSS；缩放 <浏览器缩放>。
- 观察到：
  - <控件角色、稳定可见标签、相对层级、disabled / empty / gate 文案>。
  - <打开一个可逆子层后的可见变化>。
  - <Escape / close 后的焦点或层级结果；若无法确定则明确写未观察>。
- 未观察：<因无有效样本、写风险或权限门而未证实的项目>。
- 低风险操作：<实际执行的 click/tab/escape；不得写“未观察的动作也成功”>。
- 停止情况：<none | blocked-by-write-risk | private-content-redacted | auth-boundary>。
- local mapping：<组件、E2E spec、待新增 fixture/baseline、文档链接>。
```

截图仅在无私有内容且确有视觉差异价值时保存；每张截图必须同时写清入口、观察结论、红线和当前视口。不能安全去标识化的屏幕不保存，改用上述结构化文字记录。

## 5. 观察后处理与放行规则

1. 先把事实追加到对应 `pages/**/README.md` 或带日期的只读观察文件；对缺口更新 `GOAL_COMPLETION_AUDIT.md`、`REPLICATION_ACCEPTANCE_MATRIX.md` 或专项审计，绝不反向改写旧事实。
2. 将可见 UI 事实与 local surface 一一核对：若 local 已有但视觉/交互不符，创建最小 fixture + `1440×900` E2E/visual 任务；若无官网事实，仅保留 local-only 标识。
3. UI 观察**不产生** OpenAPI 修改。只有有明确的、获准记录的真实 transport 证据才允许更新 `docs/research/libtv/api/**`；即使如此也只能创建外部 adapter note，不能把官网字段直接注入 `WorkflowDocument` 或 normalized local schema。
4. 每个新增测试至少覆盖：打开、一个可逆子层、`Escape`/关闭、disabled 或 error/empty gate、refresh/selection 语义中与已观察事实相关的部分。未观察到的成功路径不要补成“官网标准行为”。
5. 当 P0-01..P0-05 均有去标识化记录且 local visual/test/doc mapping 已建立，可进入下一轮实现与 1440×900 基线；真实生成/导出/API 仍保持独立授权门。

## 6. 与现有证据的关系

- 当前完成与未完成判定以 [GOAL_COMPLETION_AUDIT.md](GOAL_COMPLETION_AUDIT.md) 为准；本计划不将其“未完整证实”的目标改判完成。
- 七个产品 surface 的本地验收与官网边界见 [REPLICATION_ACCEPTANCE_MATRIX.md](REPLICATION_ACCEPTANCE_MATRIX.md)。
- 详细已有观察从 [INDEX.md](INDEX.md) 进入：Canvas/Storyboard、Text/Script、Clip Editor、首页、Skills、Account/Billing、Assets 和 TV Show 分别有来源文档。
- Text/Script 与 Clip Editor 的 E3/E1 分界以 [text-script-evidence-audit.md](audits/text-script-evidence-audit.md) 和 [clip-editor-evidence-audit.md](audits/clip-editor-evidence-audit.md) 为准；本计划只把尚缺事实组织成一次可执行的只读覆盖顺序。
