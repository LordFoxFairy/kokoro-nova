# 前端能力缺口审计

- 审计日期：2026-09-05
- 范围：当前前端路由、页面交互、局部编辑器、deterministic mock/fixture、官方证据与跨页面验收缺口。
- 依据：`docs/CODEBASE_MAP.md`、`docs/research/libtv/GOAL_COMPLETION_AUDIT.md`、`docs/research/libtv/FEATURE_MATRIX.md`、`docs/research/libtv/PAGE_GAP_CHECKLIST.md`、`docs/research/libtv/REPLICATION_ACCEPTANCE_MATRIX.md`、`docs/research/libtv/pages/**`、`docs/research/libtv/visual/**`，以及 `src/app/**`、`src/components/**`、`e2e/**`。
- 边界：本审计不把页面存在、路由可达或 local mock 通过误判为官网能力完成；官网真实生成、扣费、上传、发布和账户操作没有被本轮执行。

## 判定口径

### 官方证据等级

| 等级 | 含义 | 可支撑的结论 |
| --- | --- | --- |
| **E3 — 官网交互直证** | 登录态或公开态官网 UI/只读交互直接观察，并记录了截图或脱敏请求形状。 | 可支撑页面布局、控件顺序、禁用/启用、空态和一次交互后的可见状态；不自动支撑付费生成结果。 |
| **E2 — 官方资料/契约** | 官方指南、CLI/OpenAPI、官方源码或客户端 bundle 的稳定词汇/字段。 | 可支撑概念、参数类别、CLI/协议边界；不等于当前 Web 运行时行为。 |
| **E1 — 本地对齐证据** | 本仓 typed contract、fixture、domain/server test、Playwright 或 1440×900 基线。 | 只支撑本地实现的可复现性，不能升级为官网事实。 |
| **E0 — 待证实** | 只有推断、旧版记录、入口存在或尚未走过的成功/失败路径。 | 只能列为缺口和验收任务。 |

### 本地状态

- `VERIFIED_LOCAL`：本地 route/contract/fixture/UI/E2E 已闭环，但仍可能缺官网证据。
- `PARTIAL_LOCAL`：有页面和部分交互，关键状态或跨页链路未闭环。
- `MOCK_ONLY`：当前主要由 deterministic mock 或 local seam 表示。
- `MISSING`：没有可用的前端能力或验收证据。

## 当前路由与 surface 清单

| Surface | 当前路由/入口 | 前端主入口 | 当前形态 |
| --- | --- | --- | --- |
| Home | `/` | `src/components/home/HomePage.tsx` | 公开/登录态发现、快捷创作、Agent composer、TV Show 流。 |
| Project | `/project` | `src/components/project/ProjectListPage.tsx` | 项目/文件夹、搜索、回收站、菜单与生命周期 local mock。 |
| Canvas | `/canvas?projectId=…&canvasId=…` | `src/components/canvas/CanvasWorkspace.tsx` | 独立深色编辑器；Workflow、Storyboard、节点生成器、Agent、资产和协作状态。 |
| Storyboard | 同 Canvas 路由内切换 | `src/components/storyboard/StoryboardView.tsx` | 同一 `WorkflowDocument` 的媒体投影，含详情抽屉和 Clip Editor。 |
| Agent | Home/Canvas 内嵌 | `src/components/agent/AgentPanel.tsx` | 会话、历史、工具轨迹、`ask_human`、mutation proposal 和 local 状态机。 |
| Skills | `/skill`、`/skills`、`/skill/[skillId]`、`/skills/[skillId]`、`/skill/create`、`/skills/create` | `src/components/skills/*` | 公开市场、详情、收藏、composer 和作者 studio；单复数路径并存。 |
| TV Show | `/showcase`、`/showcase/[snapshotId]`，以及 Home feed | `src/components/showcase/*` | 公开目录、搜索/分页、播放器、只读制作过程和复制/喜欢登录门。 |
| Account | `/account` | `src/components/account/*` | local 身份、账本、偏好、团队、Access Key、会员/外部 handoff 投影。 |

## P0 — 放行前必须补齐的跨页能力

| ID / 页面与能力 | 现状：页面、交互、mock | 官方证据 | 主要缺口 | 验收方法 |
| --- | --- | --- | --- | --- |
| **P0-01 公开浏览 → 登录 → 返回原意图**<br>`/`、`/project`、`/canvas`、`/skill`、`/showcase` | Home 已有公开模式、登录弹层、`CreationContext`、`returnTo` 和刷新恢复；Project/Skills/Showcase 的若干按钮仍把登录动作投影为 `/account` 入口。身份和会话由 `src/api/identity` 与 local fixture 提供。 | **E3**：`pages/home/README.md` 记录手机号/扫码登录层、二维码过期；**E1**：`home-project-return-to.spec.ts`。 | 没有统一跨 surface 的会话恢复契约；Project/Skill/Showcase 的登录后目标、草稿、选中的 Skill/模型/引用、失败恢复和会话过期未全部闭环。 | 建立 `anonymous → login → returnTo` scenario，覆盖首页 composer、快捷卡、项目私有页、Skill “立即使用”、Showcase 复制；刷新/关闭弹层/登录失败后断言 intent、`CreationContext`、滚动与焦点均可恢复。 |
| **P0-02 生成任务全生命周期与账本联动**<br>Canvas 节点生成器、Storyboard、Account | Image/Video/Audio/Text/Script 使用 typed local contracts、confirm gate、Jobs/Compose、deterministic provider、ledger reserve/settle/release；E2E 已覆盖多类本地 queued/running/succeeded/failed/cancelled/retry。 | **E3**：官网观察到生成前确认、价格/额度、部分 disabled/gate；**E2**：CLI/官方模型与任务词汇；**E1**：`generation-ledger-lifecycle.spec.ts`、各 editor E2E。 | 官网真实成功、失败、取消、重试、扣费/返还及动态权益尚未有同等级证据；本地各 media job 的错误 envelope、过期 quote、不可用能力和刷新恢复仍需统一前端语义。 | 为 image/video/audio/text/script/compose 各固定同一组 fixture：`pending → running → succeeded | failed | cancelled → retry`；断言节点只写一次、结果 artifact 不重复、账本只 reserve 一次、刷新可恢复、错误可解释；补 1440×900 状态基线。 |
| **P0-03 Clip Editor / Video 合成主链路**<br>Canvas → Storyboard → Clip Editor | `ClipEditor.tsx` 已实现素材源轨、播放头、裁切、分割、移动、变速、转场、音轨、字幕、预览、撤销/重做和 `/api/compose` local task；本地 compositor 有成功/失败/取消/重试 fixture。 | **E3**：官网已观察空时间线、转场、字幕、导出门槛；**E1**：`video-compositor.spec.ts`、`compositor-reliability.spec.ts`、`visual/video-compositor-comparison.md`。 | 官网有效输入下的时间线密度、拖放/裁切/分割/变速/多轨、导出成功/失败/取消和产物归属没有直接证据；local export 是否写回同一 project/canvas 仍需明确。 | 使用含图像/视频/音频/字幕的混合 scenario；验证素材拖入、选择、trim/split/speed/transition/subtitle/audio mute、播放预览、取消/重试/失败；导出后断言唯一 output asset、源节点不变、Workflow/Storyboard/reload 一致，并固定视觉基线。 |
| **P0-04 前端 API wire contract 与错误可见性**<br>`src/lib/api`、所有 `/api/*` 消费者 | UI 已有 loading/empty/error/stale-error/retry 大量状态；OpenAPI、route manifest、Zod contracts 和 local handlers 已存在。 | **E2**：官方脱敏请求 shape、CLI/OpenAPI 资料；**E1**：`docs/api/API_AUDIT.md`、contracts/route tests。 | `GOAL_COMPLETION_AUDIT.md` 标出的 API-AUD-03 仍是放行项：runtime legacy `{ error: string }` 与 OpenAPI `ErrorResponse` 不一致，部分 404/匿名授权/示例/route smoke 覆盖不足；前端因此可能依赖分支猜错误形状。 | 统一前端可消费的 error envelope 和 request id/trace 字段；补 404/401/403/409/422/429/5xx fixtures；manifest 驱动每 route smoke matrix；E2E 断言 toast、inline error、stale data、retry、focus recovery，不允许组件按 route 私自猜 envelope。 |
| **P0-05 Agent 执行、mutation、询问与恢复**<br>Home/Canvas Agent | `AgentPanel` 已有会话、历史、删除确认、分享、模型/生成模式、工具轨迹、`ask_human`、mutation proposal/apply、错误重试；server 为 local agent fixture。 | **E3**：官网只读分析、工具轨迹、`ask_human`、额度门和刷新恢复；**E2**：Agent OpenAPI 的 session/messages/upload/change-project；**E1**：`AgentPanel.test.ts`、Agent server tests。 | 官网当前观察明确没有通用“计划后暂停”以及文本节点创建工具；local 具备 proposal/apply，不代表官方工具集。`ask_human` 回答在额度阻断后未持久化；生成中、取消、部分失败、mutation diff 和断线重连未完整验证。 | 用只读、可应用 mutation、信息不足 `ask_human`、额度阻断、网络断开、重复提交、刷新恢复 fixture 分开验收；确认回答先原子落库再续跑，确认/拒绝/忽略幂等，mutation 前后 document/revision 可对照，禁止将 local 工具枚举写成官方事实。 |

## P1 — 已有页面但能力或证据不完整

| ID / 页面与能力 | 现状：页面、交互、mock | 官方证据 | 主要缺口 | 验收方法 |
| --- | --- | --- | --- | --- |
| **P1-01 Text / Script V2 authoring**<br>Canvas 内 Text、Script 节点 | Text 有四入口、模型目录、富文本工具、starter workflow、confirm gate、TXT artifact 和 Storyboard 投影；Script V2 有三入口、三阶段 drawer、镜头表、资产来源、双轨 prompt、batch materialize。均由 typed local state/mock 支撑，已有 Text 4 张、Script 8 张 1440×900 基线。 | **E3**：Text/Script 入口、模型目录、字段、stage/gate、disabled 状态和保存/报价 shape；**E2**：bundle vocabulary；**E1**：`text-script-evidence-audit.md`、相关 E2E。 | 官网真实 run 的 queued/running/succeeded/failed/cancelled/retry、动态价格/权益、成功资源、批量视频、上传/审核/下载、错误恢复和更深视觉状态未证实。 | 分别为 Text 与 Script 增加状态 fixture 和视觉基线：confirm/result/Storyboard、run/error/retry、batch video、asset dialog、long-table drag；断言固定 version、idempotency、stale writeback、一次 undo、成功/失败不篡改 Script 文档。 |
| **P1-02 Canvas Workflow 高级编辑与协作**<br>`/canvas` Workflow | 独立深色 shell、项目/画布切换、节点菜单、节点/边、viewport、缩放、小地图、网格、整理、undo/redo、presence follow、lease eviction 已 local 闭环。 | **E3**：Canvas 深色 chrome、双视图、混合节点、presence/follow 的登录态只读证据；**E2**：CLI workspace/project/group/node 契约；**E1**：`workflow.spec.ts`、`presence-concurrency.spec.ts`。 | 真实并发冲突合并、断线重连、cursor presence、动态模型权限、真实上传限制和发布/分享/积分/账户入口仍是 local seam；类型错误、重连后的 revision 和能力 rules 未完全覆盖。 | 两隔离浏览器验证 optimistic conflict、lease release/reclaim、断线重连、旧 token 不驱逐新客户端；为每个节点类型注入 unsupported/expired quote/upload error；断言 workflow ↔ storyboard 同文档、revision、viewport 与错误焦点一致。 |
| **P1-03 资产库、上传与失效恢复**<br>Canvas 资产侧栏/完整 Asset Library/Home composer | `AssetSidebar`、`AssetLibraryPanel`、Home composer 已有个人/Agent namespace、搜索、分类、文件夹、标签、批量上限 50、上传 dropzone、插入画布、不可用筛选和 retry/error；媒体使用本地 fixture。 | **E3**：官网个人资产库空态、分类、标签、批量动作、角色/主体库入口；**E2**：upload/asset/合规指南；**E1**：asset/upload lifecycle tests。 | 有内容时的缩略图/metadata、格式大小校验、重复文件、取消/断点续传、权限变更、删除/恢复、角色/主体/音色审核和 media URL 失效没有完整官网证据；source/owner/Job 归属需跨页面一致。 | 固定 upload queued/progress/success/duplicate/invalid/cancelled/retry/revoked fixture；覆盖个人/Agent/团队隔离、插入后节点引用、删除源后的 orphan/recovery card、50 项上限、媒体 404/过期、合规 blocked/expired，并验证资产详情和生成历史一致。 |
| **P1-04 Skills 市场、使用与作者生命周期**<br>`/skill*` 与 Home/Agent composer | `/skill` 与 `/skills` 双路径，详情、四图轮播/lightbox、分类/搜索、收藏/我的、composer 上下文、作者 create/edit/version/review/publish/unpublish local fixture 与 E2E 已有；入口以 local API 提供。 | **E3**：官网 `/skill` 市场首屏、收藏/我的空态、详情、轮播和使用入口；**E2**：Skill/CLI 执行规范；**E1**：`skills-parity.spec.ts`、`skills-authoring.spec.ts`。 | “立即使用”尚未与真实登录后会话、确认、pending/result/error 形成跨页闭环；顶部 market composer 与 Home `CreationContext` 需统一；目录分页/失效版本/权限不足/分享真实语义未证实。 | 以 `skillId + version` 为快照：市场 → 详情 → 添加到 composer → 登录门 → 会话注入 → 确认 → result/error；作者 `draft → version → review → publish → unpublish → invalid/permission denied`；刷新后保持版本和引用，补目录 cursor/error/empty。 |
| **P1-05 TV Show 公开发现、播放器与复制**<br>Home feed、`/showcase`、`/showcase/[snapshotId]` | Home 与 Showcase 共用 `ShowcaseEntryProjectionBaseSchema`/local discovery fixture；目录有分类、提交搜索、推荐回退、分页/无限滚动、retry；详情有播放器、倍速、清晰度、音量、全屏、buffering/error、只读 Workflow/Storyboard、喜欢/分享和匿名复制登录门。 | **E3**：官网首页 TV Show、详情播放器、公开制作过程、只读视图与复制登录门；**E1**：`public-discovery.spec.ts`、`visual/2026-09-04-public-discovery-fidelity-audit.md`。 | 官网是否存在稳定独立目录/详情 URL、分页 cursor、字幕/多音轨、认证后复制目标 workspace/进度/归属/失败、登录后喜欢/分享反馈未完全证实；本地媒体是 `/api/media` fixture。 | 固定首屏/分页/搜索/空集合/旧数据刷新/媒体 ready-buffering-error-retry；已登录复制成功与 clone failure retry，断言 snapshot 不变、副本归属、资源复制、返回路径、喜欢/分享反馈和播放器状态；明确本地 `/showcase` 不是官网 URL 事实。 |
| **P1-06 Project / folder / recycle bin 生命周期**<br>`/project` | 四列布局、搜索/空态、创建项目/文件夹、打开、重命名、封面、复制、移动、删除确认、回收站空态、loading/error/retry 已实现；项目 API 与 deterministic fixture 已有。 | **E3**：官网项目 toolbar、空 workspace、菜单和删除确认；**E1**：`project-manager.spec.ts`、`project-lifecycle.spec.ts`、`PAGE_GAP_CHECKLIST.md`。 | 既有代码路径仍缺一条完整端到端持久化闭环；官网卡片打开/新窗口/封面/分页细节、回收站恢复/永久删除/失败、私有边界和登录回跳未充分证实。 | 运行 create → rename → cover → duplicate → move → refresh → delete → recycle restore/permanent-delete 全链路；每步同时断言 API、卡片、URL、folder scope、回收站和刷新结果，结束恢复空 fixture。 |
| **P1-07 Account / membership / team / external domain**<br>`/account`、Canvas 顶栏、头像菜单 | local 已有身份、脱敏 UUID、Access Key 状态/轮换/撤销、账本分页、held/settled/released、偏好、水印、通知、团队成员/共享资产和外部 handoff 投影；Account E2E/route tests 已有。 | **E3**：官网头像菜单、主题、水印、通知、会员/积分/存储、团队/外部域入口；**E2**：CLI/账户边界资料；**E1**：account E2E 与 contracts。 | `/account` 仍不是官网完整账户域；订阅/发票/模型超市/共享资产/个人中心/发布点赞的真实页面和会话共享未形成前端完整 projection；Access Key 真实生命周期、注销/导出/跨设备退出没有证据。 | 把 `LocalIdentity`、`Preferences`、`NotificationSummary`、`Membership`、`Ledger` 作为独立投影复用到 Home/Canvas/Account；覆盖手动刷新/陈旧保留/error/retry、Access Key 脱敏和幂等、团队权限、外部 handoff 返回原页，禁止写真实凭据。 |

## P2 — 细节、深度状态与证据收口

| ID / 页面与能力 | 现状：页面、交互、mock | 官方证据 | 主要缺口 | 验收方法 |
| --- | --- | --- | --- | --- |
| **P2-01 导演台 / 角色 / 主体深度能力**<br>Canvas modal | `DirectorStudio` 已有 top-down map、camera/lens preview、actor/prop、pose、snap、shot capture、keyboard action、dirty/save/error/retry；角色库已有本地应用到多图片节点的 fixture。 | **E3/E2**：官网导演台、3D 场景、角色、机位、时间轴、全景及主体库/指南入口；**E1**：`DirectorStudio.test.ts`、character E2E。 | 保存后的真实项目写回、截图/动画导出、识图完成、角色/主体编辑权限、失效和跨任务复用未完全验证。 | map/lens/keyboard/shot/save failure/retry 视觉回归；保存后刷新验证 `scene + shots` 版本一致；导出/识图与 asset reference 只使用 local fixture，覆盖删除/权限/失效。 |
| **P2-02 Onboarding、通知与增长局部状态**<br>公开 Home、Account preference、首次登录问卷 | 本地有 Home loading/error/retry、通知/偏好 section；onboarding 目前主要是静态/研究记录，尚未把问卷流程纳入核心本地状态。 | **E3**：首次登录问卷 iframe 第一步、二维码过期、通知中心空态/未读；**E0**：后续问卷、跳过/关闭、画像影响、实时到达。 | 后续问卷、跳过/关闭、完成写回、通知实时到达/跳转、跨页未读数同步没有实现或证据。 | 增加不提交真实偏好的 `onboarding-step-1/next/skip/close/expired/error` fixture；通知 unread/read/deep-link/refresh/error E2E，断言不阻塞创作主路径。 |
| **P2-03 公开链接、发布审核与 URL 语义**<br>Canvas 发布/分享、Showcase detail | PublicCanvasView、PublishedSnapshot、只读 Workflow/Storyboard、匿名复制门和分享状态的 local seam 已有；Canvas 顶部发布/分享仍由 local contract 表示。 | **E3**：公开作品详情、只读制作过程、分享权限文案；**E0**：审核、上架、下架、推荐、公开链接稳定路由和撤销。 | 发布审核/下架/撤销、分享链接创建与失效、未公开提示、公开快照权限、复制后的 workspace 归属未完整闭环；不能把 `/showcase` 当成官网已确认 URL。 | 固定 draft → publish-pending → published → unlisted/revoked/error；验证 snapshot 冻结、匿名只读、复制不写源、链接失效提示、返回路径、Workflow/Storyboard 同一 snapshot；补 URL/metadata/分享按钮视觉基线。 |
| **P2-04 跨 viewport、可访问性与视觉状态覆盖**<br>所有 surface | 主要桌面基线为 1440×900，已有键盘/Escape/focus/响应式单测；Canvas 需独立 chrome，Home/Project/Skills/Showcase/Account 各有局部视觉基线。 | **E3**：官网桌面截图和部分 DOM 几何；**E1**：visual baselines、responsive/accessibility tests。 | 未所有关键错误/禁用/焦点/长列表/缩放/窄屏状态建立稳定基线；Clip Editor、Text/Script run states、asset dialogs、team/account depth 仍缺截图；宿主裁切与物理像素尺寸易混淆。 | 以 CSS viewport `1440×900`、`deviceScaleFactor=1` 固定基线；为每个 P0/P1 状态补 loading/empty/disabled/error/retry/success/focus/Escape；窄屏只验已有官方证据或明确 local-only，避免凭空扩展产品行为。 |

## 结论与放行顺序

1. 本地前端已经覆盖 Home、Project、Canvas/Workflow、Storyboard、Agent、Skills、TV Show、Account 的大量可演示主路径；`REPLICATION_ACCEPTANCE_MATRIX.md` 中的 `VERIFIED_LOCAL` 只说明 deterministic local mock、typed contract、E2E 和截图闭环。
2. 当前真正阻塞“前端能力完整”的 P0 是：统一身份回跳、生成/账本生命周期、可编辑视频合成、API wire contract、Agent 执行恢复。它们都需要跨页面状态，而不是再增加静态卡片。
3. P1 先补 Text/Script 状态深度、Canvas 协作/能力错误、资产失效、Skill 使用闭环、TV Show 认证复制和 Project/Account 生命周期；每项都要保持官网事实与 local-only contract 的明确边界。
4. P2 再收口导演台、onboarding/通知、发布审核/公开 URL 和全状态视觉基线。
5. 每个切片的最小放行门：**mock route + Zod contract + fixture/scenario + UI 状态 + 单元/领域测试 + Playwright 交互 + 1440×900 关键基线 + 文档证据等级** 同向；未满足时保持 `PARTIAL_LOCAL` 或 `MOCK_ONLY`，不得用绿 CI 或路由存在替代官方能力证据。

## 变更文件

- `docs/research/libtv/audits/frontend-capability-gap-audit.md`
