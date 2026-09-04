# 公开发现 Surface Fidelity Audit

- 审核日期：2026-09-04
- 证据边界：官网已归档的页面观察；当前主仓库路由、组件与测试。未对官网账号、内容或凭据执行写操作。
- 审核目的：把“本地存在一个相近页面”与“已高保真复刻官网发现路径”分开，避免将通用样例页面误计为 LibTV parity。

## 结论

首页首屏、项目管理、画布、Storyboard 和节点编辑器已经有本地 mock、交互验证及桌面视觉基线。公开发现的后半段仍有三个必须显式收敛的差异：TV Show 全量目录/详情、Skill 广场/详情、共享账户域。

这些页面当前均能在本地独立访问，且各自有最小的 API 和交互测试；但它们没有复用当前深色 LibTV Shell，也没有覆盖官网已观察到的完整信息架构与状态。它们因此保留为 `PARTIAL`，不进入 `VERIFIED_LOCAL`。

## 当前本地视觉复核

使用隔离 `DATA_DIR`、`public-showcase` fixture 和 `1440×900` Chromium 于 2026-09-04
复核了 `/showcase`、`/skills`、`/account`。三个页面均为可运行的 local mock，不读取远端
数据；它们也使下述差异成为可复现的当前事实，而不是仅由源码推断：

- `/showcase` 是浅色、单卡、左上品牌加“我的项目”的宽松画廊；没有 LibTV TV Show 的深色
  应用 Shell、分类条、搜索、作品详情媒体背景或播放器控制。
- `/skills` 是浅色满宽技能瀑布流，具备分类、搜索和收藏星标；它不保留官网顶部创作 composer
  或详情中的媒体轮播/lightbox 链路。
- `/account` 是浅色居中 ledger，余额预留/结算的领域投影完整；它与官网深色头像账户菜单、
  会员/存储/偏好/通知入口属于不同的页面结构。

这些截图仅用于本地现状审计，不被加入视觉 baseline，也不作为官网证据。

## 官网当前公共首页轻量复核

2026-09-04 重新读取 `https://www.liblib.tv/` 的公开 HTML 文本。当前页面仍直接暴露活动条、
“新建画布创作”、Seedance 2.5/Wan 3.0/Minimax H3 Max/导演台/逐帧拉片/片段重拍六个创作
入口、`LibTV Agent`、`TV Show`、默认“全部”分类和搜索输入。这与本地首页发现面已经固定的
内容顺序相符；公开文本没有提供 `/showcase` 的可用路由或详情状态，因此目录/详情交互仍以
已归档的官网页面观察为事实来源，不能把当前本地 `/showcase` 的通用画廊误当成官网直接路由。

## 当前公开路径的运行时契约复核

同一隔离 `public-showcase` fixture 下，`POST /api/dev/scenario`、`GET /api/publish`
与 `GET /api/publish/{snapshotId}` 均返回 `200`。目录固定返回一个条目；其 summary 字段仅为
`id`、`projectId`、`canvasId`、`title`、`summary`、`coverUrl`、`publishedAt`、`state`、
`nodeCount`、`mediaCount`。这证实了当前 endpoint 是冻结 workflow 快照目录，而不是官网
TV Show 的发现/播放目录：缺少作者、等级、分类、互动统计、相邻作品和播放源。

浏览器继续证明该现有契约的可用边界：目录卡可进入只读页面，默认 Workflow 与切换后的
Storyboard 都可渲染，`复制项目` enabled 后会打开本地登录门。登录门明确保持“浏览不受影响”，
而没有制造虚假的复制成功。下一批应保留这三项已验证语义，同时在独立 `ShowcaseEntry`
发现 projection 中补齐目录和详情所需字段；不应把作者、分类或播放器瞬态状态塞进
`PublishedSnapshot.document`。

## 证据对照

| Surface | 官网已观察的事实 | 当前本地实现 | Fidelity 缺口 | 进入 `VERIFIED_LOCAL` 的最小验收 |
| --- | --- | --- | --- | --- |
| TV Show 目录与详情 | 分类/搜索、媒体卡、详情沉浸背景、播放控制、相邻作品带、只读制作过程、登录后复制门槛；见 [`pages/showcase/README.md`](../pages/showcase/README.md) | 首页 `TvShowFeed` 有本地分类、即时过滤、详情摘要弹层与 `/showcase` 跳转；`ShowcaseGallery` 是独立浅色冻结快照网格 | `/showcase` 与首页 TV Show 的深色视觉、作品详情、播放器、搜索回退、过程入口和上下文连续性不一致 | 一个共享 `ShowcaseEntry` fixture；目录、详情/播放器、只读 Workflow/Storyboard、认证复制门分别有确定性 mock 状态、API operation、1440×900 快照与键盘流程 |
| Skill 广场与详情 | 顶部创作输入、全部/收藏/我的、分类、卡片、详情四图轮播/原图层、添加 Skill/收藏/分享语义；见 [`pages/skills/README.md`](../pages/skills/README.md) | `/skills` 提供浅色列表、搜索、分类、收藏和结构化详情；首页与画布已分别有 Skill 上下文 | 页面 shell、详情媒体轮播/原图层、未登录与登录的收藏/我的门、详情“添加”到 composer 的回流没有按官网链路实现 | Skill 目录与详情共用版本化 mock；收藏、添加、认证门、轮播/lightbox、返回 composer 上下文各有 E2E；目录和详情各有桌面视觉基线 |
| 账户与共享账户域 | 深色头像菜单内有身份、会员、积分/余额池、存储、主题、水印、通知和个人中心入口；钱包/资产/订阅跨 LibTV 与主站共享；见 [`pages/account/README.md`](../pages/account/README.md) | `/account` 是浅色本地 ledger；编辑器/首页有积分余额但没有官网账户菜单投影 | ledger 的预留/返还领域正确，但外层导航、主题偏好、通知/水印/存储入口及共享账户边界没有被表达 | 深色账户菜单以显式的 local identity fixture 驱动；余额池、ledger、偏好和入口状态写入契约；菜单键盘、余额刷新/错误、积分账本各有 E2E 与桌面基线 |

## 当前路由与契约边界

| Local route | 当前主要 API | 保留的后端 seam |
| --- | --- | --- |
| `/showcase` / `/showcase/:snapshotId` | `GET /api/publish`、`GET /api/publish/{snapshotId}`、`POST /api/publish`、`DELETE /api/publish/{snapshotId}` | `PublishedSnapshot` 继续作为冻结只读 document；需补独立的发现条目/播放投影，不把浏览统计或播放器状态写回快照 document |
| `/skills` / `/skills/:skillId` | `GET /api/skills`、`GET|POST /api/skills/{skillId}` | `SkillCard` 与版本化 detail 保持分层；用户收藏和 composer 上下文属于 account/session 状态，不能混入公开 Skill catalogue |
| `/account` | `GET /api/ledger` | 余额、预留、结算、返还继续由 ledger 单一事实源提供；身份、偏好、通知和团队属于未来 account seam，应使用独立 mock contract，而不是改写 Jobs API |

## 实施顺序

1. **TV Show 路径优先**：它已经从首页暴露“探索全部”和“查看创作过程”，也是 Video 创作/复制闭环的公开入口。先统一首页卡与目录的 fixture 标识，再补目录、详情、播放器和只读过程的状态机。
2. **Skill 闭环第二**：复用已存在的版本化 Skill 数据与 Agent composer，补齐官网详情媒体、上下文回流及登录/收藏状态，而不是重新设计独立 Skill 数据模型。
3. **账户域第三**：保留当前 ledger 状态机，先把账户菜单和跨页余额投影统一到 local identity/preferences contract，再扩展通知和共享资产入口。

每一批都应同时修改：对应 runtime schema/fixture、`docs/api/openapi.yaml` 与 `docs/api/` 说明、surface E2E、1440×900 基线和本矩阵状态。未同时覆盖这五项的页面不得标记为完成。
