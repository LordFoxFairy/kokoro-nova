# Kokoro Nova × LibTV 复刻验收矩阵

- 审核对象：`main` 当前本地前端与 local mock
- 审核日期：2026-09-04
- 官网基准：<https://www.liblib.tv/>
- 视口基准：桌面 `1440×900` CSS viewport；截图若由 `deviceScaleFactor=2` 产出，物理位图会是 `2880×1800`
- 证据边界：官网公开页面、已归档的登录态只读观察、本地源码/测试/截图；没有执行真实生成、充值、购买、发布、删除或凭据读取

## 判定规则

| 标记 | 含义 |
| --- | --- |
| `VERIFIED_LOCAL` | 本地 mock、交互测试和桌面截图共同覆盖了验收项；不代表官网所有未知后端状态已实现 |
| `PARTIAL` | 主路径或视觉层已存在，但仍缺官网可见状态、持久契约、权限边界或可验证的失败/成功态 |
| `PENDING` | 当前没有足够的官网证据或本地实现，下一批需要先补观察或契约 |
| `COST_GATED` | 需要真实生成、支付或账户写入才能确认，本轮不执行 |

## 七个 surface 总览

| Surface | 官网验收范围 | 当前 main 证据 | 当前判定 | 主要缺口 / 下一道门 |
| --- | --- | --- | --- | --- |
| 首页 Home | 活动条、侧栏、新建画布、六个快捷工具、最近项目、Agent 起始器、TV Show 首层 | `HomePage`、`HomeAgentComposer`、`AuthenticatedShell`、`TvShowFeed`；`e2e/home-project.spec.ts`；`docs/screenshots/libtv-home-local-1440x900.png` | `PARTIAL`（布局与 Agent 创作入口 `VERIFIED_LOCAL`） | 登录只是假门；会话恢复/回跳仍是后端接手 seam |
| Project | 全部项目、搜索、文件夹、回收站、项目卡菜单与空态 | `ProjectListPage`、项目/文件夹 API；`e2e/home-project.spec.ts`；两张项目基线 | `PARTIAL`（管理核心 `VERIFIED_LOCAL`） | `/account` 被当作登录落点但实际是积分账本；文件夹封面/移动/副本完整 E2E 和公开权限边界仍缺 |
| Canvas / Workflow | 独立全屏 chrome、画布切换、节点/连线、工具箱、资产、生成状态、协作 | `CanvasWorkspace`、`WorkflowCanvas`、`BottomToolbar`；`e2e/canvas-parity.spec.ts`、`e2e/kokoro-nova-parity.spec.ts` | `VERIFIED_LOCAL`（编辑核心） | 官网真实长任务、取消/失败/重试、协同冲突和动态模型权限仍未观察；本地生成仍是 deterministic mock |
| Storyboard | 同一文档的文本/音频/图片/视频投影、筛选/展开、详情、定位/副本、剪辑入口 | `projectStoryboard()`、`StoryboardView`、`MediaDetailDrawer`、`ClipEditor`；`e2e/canvas-parity.spec.ts` | `VERIFIED_LOCAL`（投影核心） | 官网有效输入、导出/失败/取消和媒体持久化边界未确认；需继续证明切换不产生第二份文档 |
| Skills | 创作输入、Skill/收藏/我的、分类/搜索、卡片、详情、示例轮播、原图、添加/使用 | `SkillGallery`、`SkillDetail`、`SkillMarketComposer`、版本化 `SKILL_CATALOGUE`；`e2e/skills-parity.spec.ts`；四张 local 基线 | `PARTIAL`（创作入口 `VERIFIED_LOCAL`） | 官网实际入口是 `/skill`，local 为 `/skills`；作者创建/版本/审核/发布未实现 |
| TV Show | 首页内容流、分类/搜索、作品详情、播放器、相邻作品、只读制作过程、复制登录门 | `ShowcaseGallery`、`ShowcaseDetailView`、`PublicCanvasView`；`e2e/public-discovery.spec.ts`；catalog/detail/player 基线 | `PARTIAL`（公共闭环已可演示） | 首页与目录需共用发现 projection；分页/加载失败/真实媒体变体/登录后复制归属/互动反馈未完成；官网稳定详情 URL 未公开确认 |
| Account | 头像菜单、身份/UUID/Access key、会员/积分/存储、主题、水印、通知、个人中心、账本 | 官网头像菜单与账户截图；local `AccountPage`、`LedgerView`、`src/components/account/__tests__/account-surfaces.test.ts` | `PARTIAL` | local 只覆盖积分账本，不是官网账户菜单；身份、主题、通知、水印、团队、资产、订阅与发票入口缺失 |

## 分项验收矩阵

### H — 首页 Home

| ID | 验收项 | 官网证据 | local 实现 / 测试 | 状态 |
| --- | --- | --- | --- | --- |
| H-01 | `1440×900` 活动条、侧栏、账户轨和内容重排 | [首页登录态基线](pages/home/screenshots/home-authenticated-desktop-1440x900-2026-09-03.png)、[公开首页观察](pages/home/2026-09-04-public-surface.md) | `AuthenticatedShell`、`AppSidebar`、`AccountRail`；`e2e/home-project.spec.ts` | `VERIFIED_LOCAL` |
| H-02 | 新建画布和六个快捷创作入口能携带稳定 intent | [官方首页](https://www.liblib.tv/) | `HomePage`、`CreatorToolGrid`；`home creator tool carries deterministic intent` | `VERIFIED_LOCAL` |
| H-03 | Agent 空态禁用发送，合法草稿可创建并保留附件/Skill/模型/生成模式上下文 | [首页创作控件基线](pages/home/screenshots/home-composer-focused-empty-desktop-1440x900-hires.png)、[有效草稿](pages/home/screenshots/home-composer-valid-draft-send-enabled-desktop-1440x900-hires.png) | `HomeAgentComposer`、`HomeAgentComposer.test.ts`；`home Agent composer selects context...`、`home Agent composer keeps context controls local...` | `VERIFIED_LOCAL` |
| H-04 | TV Show 分类轨、左右滚动、提交式搜索、推荐回退 | [公开首页观察](pages/home/2026-09-04-public-surface.md) | `TvShowFeed.filterTvShowItems`、`resolveTvShowSearch`；`home-project.spec.ts`；与 `/api/showcase` 共用基础发现 projection | `VERIFIED_LOCAL`（冻结目录） |
| H-05 | 公开浏览与私有创作并置，登录门不清空当前上下文 | 官网登录入口与本地公开 fixture | `publicMode`、`home-login-dialog`；`e2e/home-project.spec.ts` | `PARTIAL`：本地登录落点仍是 mock `/account`，没有会话恢复/回跳契约 |

### P — Project

| ID | 验收项 | 官网证据 | local 实现 / 测试 | 状态 |
| --- | --- | --- | --- | --- |
| P-01 | 活动条 + 侧栏 + `返回 → 全部项目 → 搜索 → 回收站 → 新建文件夹` | [项目页观察](pages/home/2026-09-04-project-empty-surface.md)、[项目基线](pages/home/screenshots/project-authenticated-desktop-1440x900-2026-09-03.png) | `ProjectToolbar`；`e2e/home-project.spec.ts`、`home-visual-parity.spec.ts` | `VERIFIED_LOCAL` |
| P-02 | 四列项目/文件夹卡，空态、搜索空态、回收站空态 | [官方项目页](https://www.liblib.tv/project) | `filterProjectRows`、`getProjectListEmptyState`、`RecycleBinDialog` | `VERIFIED_LOCAL` |
| P-03 | 项目/文件夹打开、重命名、封面、副本、移动、删除确认 | [项目卡菜单基线](pages/canvas/screenshots/project-card-actions-menu-desktop-1440x900-hires.png)、[删除确认](pages/canvas/screenshots/project-delete-confirmation-dialog-desktop-1440x900-hires.png) | `ProjectCard`、`FolderCard`、`Menu`、确认门；`home-project.spec.ts` 已覆盖菜单/重命名/确认 | `PARTIAL`：封面、移动、副本和文件夹生命周期缺少同等 E2E 证据 |
| P-04 | 空 workspace 中二级动作保持 enabled | [项目空态观察](pages/home/2026-09-04-project-empty-surface.md) | `ProjectToolbar`、空态按钮 | `VERIFIED_LOCAL` |
| P-05 | 私有项目的认证、刷新恢复和错误反馈 | 官网登录态与权限提示观察 | `useHomeDiscoveryState`、`project-load-error`、`project-refresh-error` | `PARTIAL`：登录/会话是 local fixture，缺独立 `Identity` contract |

### C — Canvas / Workflow

| ID | 验收项 | 官网证据 | local 实现 / 测试 | 状态 |
| --- | --- | --- | --- | --- |
| C-01 | 不继承首页侧栏的独立深色全屏编辑器 | [当前画布基线](pages/canvas/screenshots/canvas-authenticated-current-dark-desktop-1440x900-2026-09-03.png)、[只读复核](pages/canvas/2026-09-04-live-project-readonly.md) | `CanvasWorkspace`、`TopBar`；`e2e/canvas-parity.spec.ts` | `VERIFIED_LOCAL` |
| C-02 | 顶部项目/画布切换、工作流/故事板切换、发布/积分/Agent 入口 | [画布只读复核](pages/canvas/2026-09-04-live-project-readonly.md) | `TopBar`、`view-mode-switch`；`e2e/kokoro-nova-parity.spec.ts` | `VERIFIED_LOCAL`（local contract） |
| C-03 | 添加节点菜单 taxonomy、四类 starter、节点/边几何与可访问选择 | [添加节点基线](pages/canvas/screenshots/canvas-add-node-current-dark-desktop-1440x900-2026-09-03.png) | `WorkflowCanvas`、`NodeCard`、`BottomToolbar`；`e2e/canvas-parity.spec.ts` | `VERIFIED_LOCAL` |
| C-04 | 文档 reducer、revision、撤销/重做、保存 viewport 与刷新恢复 | 官方 CLI/只读混合节点观察；[工作流 README](pages/canvas/README.md) | `src/domain/mutations.ts`、`editor-store.ts`；domain tests、`e2e/workflow.spec.ts` | `VERIFIED_LOCAL`（本地持久语义） |
| C-05 | 图片/视频/音频/文本/脚本/导演台/工具箱的可演示节点状态 | 官网当前混合节点只读复核、节点分段截图 | `NodeCard` 与各 editor；audio/image/text/video/script/director E2E | `VERIFIED_LOCAL`（deterministic mock） |
| C-06 | 运行中、成功、失败、取消、重试和计费冻结/返还 | [计费/生成研究](FEATURE_MATRIX.md) | Jobs、confirm gate、ledger projection 与单测 | `PARTIAL` / `COST_GATED`：官网真实运行和结算未做付费操作 |
| C-07 | 多画布管理、协作跟随、并发编辑驱逐 | [多画布/协作截图](pages/canvas/README.md) | `presence-client`、canvas routes；`e2e/kokoro-nova-parity.spec.ts` | `PARTIAL`：本地单用户/租约 mock 已有，真正多用户冲突未确认 |

### S — Storyboard

| ID | 验收项 | 官网证据 | local 实现 / 测试 | 状态 |
| --- | --- | --- | --- | --- |
| S-01 | 工作流与故事板消费同一 `WorkflowDocument`，切换不写 revision | [故事板映射截图](pages/canvas/screenshots/storyboard-populated-text-image-video-columns.png) | `projectStoryboard()`、`StoryboardView`；`e2e/canvas-parity.spec.ts` | `VERIFIED_LOCAL` |
| S-02 | 音频/文本复合左轨、图片/视频动态列、视频全部/成片/片段筛选 | [故事板当前基线](pages/canvas/screenshots/storyboard-authenticated-current-dark-desktop-1440x900-2026-09-03.png)、[筛选菜单](pages/canvas/screenshots/storyboard-video-filter-menu-all-final-clips-desktop-1440x900-hires.png) | `StoryboardView`；`responsive-layout.test.ts`、`canvas-parity.spec.ts` | `VERIFIED_LOCAL` |
| S-03 | 卡片详情、源节点定位、副本、Agent 引用、剪辑入口 | [故事板与 Agent](pages/canvas/screenshots/storyboard-with-agent-ask-human-desktop-1440x900-hires.png) | `MediaDetailDrawer`、`ClipEditor`、`editor-store`；`canvas-parity.spec.ts` | `VERIFIED_LOCAL` |
| S-04 | 有效媒体输入、剪辑持久化、导出成功/失败/取消 | 官网空时间线/导出门槛证据；[canvas README](pages/canvas/README.md) | `ClipEditor`、`compose` local renderer；`video-compositor.spec.ts` | `PARTIAL`：官网有效输入和真实导出状态待观察 |

### K — Skills

| ID | 验收项 | 官网证据 | local 实现 / 测试 | 状态 |
| --- | --- | --- | --- | --- |
| K-01 | Skill 市场首屏含创作输入、Skill/收藏/我的、分类和搜索 | 官方实际入口为 [`/skill`](https://www.liblib.tv/skill)，而非 `/skills` | `SkillGallery`；`docs/screenshots/skills-market-dark-1440x900.png`；`e2e/skills-parity.spec.ts` | `PARTIAL`：local 路径是产品自有 `/skills`，需决定是否保留兼容 alias |
| K-02 | 卡片包含封面、类型、稳定 slash 名、简介、作者、使用量、收藏 | [Skill 页面 README](pages/skills/README.md) | `SkillCard`、`SKILL_CATALOGUE`、`SkillGridCard` | `VERIFIED_LOCAL`（冻结目录） |
| K-03 | 收藏/取消收藏、分类/搜索、空态与错误/刷新反馈 | [收藏与空态截图](pages/skills/screenshots/skill-market-authenticated-favorites-empty.png) | `setSkillFavourite`、request state、retry；`skill-surfaces.test.ts`、`skills-parity.spec.ts` | `VERIFIED_LOCAL`（local contract） |
| K-04 | 详情元数据、四图轮播、原图层、分享、添加到 composer、立即使用登录门 | [详情与轮播](pages/skills/README.md) | `SkillDetail`；`skills-detail-carousel-dark-1440x900.png`、`skills-detail-lightbox-dark-1440x900.png`；`skills-parity.spec.ts` | `VERIFIED_LOCAL`（local interaction） |
| K-05 | composer 的附件/选择 Skill/参考/生成模式按钮打开真实上下文层 | [官网 Skill composer](pages/skills/README.md) | `SkillMarketComposer` + `GET /api/skills?composer=…` 的 typed local fixture；`skills-parity.spec.ts` 覆盖可访问 drawer、匿名门、empty/error/retry | `VERIFIED_LOCAL` |
| K-06 | 我的 Skill、作者创建、编辑、版本、审核、发布和失效 | [作者表单截图](pages/skills/screenshots/skill-author-create-editor-fields-and-file-tree.png) | 目录只保留 `personal` 查询类型，没有作者页 route | `PENDING` |

### V — TV Show

| ID | 验收项 | 官网证据 | local 实现 / 测试 | 状态 |
| --- | --- | --- | --- | --- |
| V-01 | 首页 TV Show 内容流、分类轨、搜索按钮、作品卡和部分 disabled 过程入口 | [官方首页](https://www.liblib.tv/)、[首页公开观察](pages/home/2026-09-04-public-surface.md) | `TvShowFeed`、`HOME_DISCOVERY_CATALOG`；`home-project.spec.ts` | `VERIFIED_LOCAL`（首页冻结投影） |
| V-02 | 独立目录的分类/搜索/作者/统计/节点数和推荐/空态 | [目录证据](pages/showcase/README.md) | `ShowcaseGallery`、`ShowcaseEntryProjection`；`public-discovery.spec.ts` | `VERIFIED_LOCAL`（local mock） |
| V-03 | 详情沉浸背景、观看、倍速、清晰度、音量、全屏、相邻作品带 | [播放器截图](pages/showcase/screenshots/player-controls-speed-quality-volume-fullscreen.png) | `ShowcaseDetailView`；`public-discovery.spec.ts` | `PARTIAL`：local 控件有，真实媒体变体/缓冲/失败态没有官网网络证据 |
| V-04 | 查看制作过程保持作品上下文，Workflow/Storyboard 只读，复制触发认证门 | [公开工作流](pages/showcase/screenshots/public-production-process-readonly-workflow.png)、[公开故事板](pages/showcase/screenshots/public-production-process-readonly-storyboard.png) | `PublicCanvasView`；`public-discovery.spec.ts` | `VERIFIED_LOCAL`（未登录门） |
| V-05 | 公开快照与作者/分类/统计/播放器 projection 分层 | [public product 研究](references/public-product/README.md) | `PublishedSnapshot` + `ShowcaseEntryProjection` + `/api/showcase`；`HomeShowcaseItem` 从同一基础 projection 挑选首页字段，并强制 `id === snapshotId` | `VERIFIED_LOCAL`（公开 discovery projection） |
| V-06 | 分页/无限滚动、目录/媒体加载失败、喜欢/分享反馈、登录后复制归属与失败 | [TV Show 待补清单](pages/showcase/README.md) | `public-discovery.spec.ts` 覆盖目录 retry、匿名登录门，以及已登录确认 → 原子 clone → 新私有项目/画布 → 打开副本；分页、喜欢与 clone 失败仍待补 | `PARTIAL`（local clone 成功态已验证） |

### A — Account

| ID | 验收项 | 官网证据 | local 实现 / 测试 | 状态 |
| --- | --- | --- | --- | --- |
| A-01 | 头像菜单中的身份、脱敏 UUID、Access key、团队、会员、积分和存储摘要 | [账户菜单](pages/account/screenshots/profile-menu-authenticated-overview.png) | `AccountRail` 只有余额/账户链接；`AccountPage` 是独立账本 | `PENDING` |
| A-02 | 余额池、消耗顺序、冻结/结算/返还和可解释明细 | [积分账本证据](pages/billing/README.md) | `LedgerView`、`projectLedger`、`/api/ledger`；account unit tests | `VERIFIED_LOCAL`（领域投影） |
| A-03 | 主题切换、AI 水印设置、通知中心和个人中心跳转 | [暗色菜单](pages/account/screenshots/profile-menu-dark-mode.png)、[水印规则](pages/account/screenshots/ai-watermark-removal-rules-and-toggle.png)、[通知](pages/account/README.md) | 无对应 local route/contract | `PENDING` |
| A-04 | 共享资产、订阅/开发票、模型超市、团队与 Access key 生命周期 | [账户外部域](pages/account/README.md) | 只有 ledger 与静态入口文字，未建 Identity/Preference/Team contract | `PENDING` |
| A-05 | 账本初次加载、刷新、陈旧数据保留和重试 | 官网账本状态未完整公开；local 需求由产品契约定义 | `getAccountRequestState`、`account-surfaces.test.ts` | `VERIFIED_LOCAL`（local failure state） |

## 统一放行门

七个 surface 进入下一阶段的共同最低条件：

1. 视觉：以 `1440×900` CSS viewport 固定字体、动画、媒体和截图尺寸；每个 surface 至少有首屏、一个关键弹层/菜单、一个空态或错误态。
2. 交互：关键操作用可访问名称和键盘路径验收，至少覆盖 Escape 关闭、Enter 提交、disabled 条件和刷新恢复。
3. 契约：页面、API route、server mock、domain projection 使用同一稳定 id；不要把作者/播放器瞬态/账户偏好写进冻结 workflow document。
4. 状态：loading、ready、empty、error、stale-error、permission/cost gate 明确可区分；未观察的官网状态保持 `PENDING`，不要用“有页面”替代完成。
5. 安全：所有凭据、Cookie、Token、验证码和未脱敏账户标识继续留在本地被忽略的运行目录，不进入截图、fixture 或提交。
