# LibTV 逐页差距清单

审核日期：2026-09-04。以下清单把官网观察、当前 `main` 的实现和下一步证据分开；`✓` 只表示本地已有可复现覆盖，不表示真实 LibTV 后端已接通。

## 1. 首页 Home (`/`)

官网当前公开首屏可见活动条、侧边导航、新建画布、Seedance 2.5、Wan 3.0、Minimax H3 Max、导演台、逐帧拉片、片段重拍、LibTV Agent 和 TV Show。详见 [公开首页观察](pages/home/2026-09-04-public-surface.md)。

### 已覆盖

- [x] 1440×900 深色壳、活动条、侧边栏、账户轨和内容随侧栏收起重排。
- [x] 六个快捷创作卡和空白画布卡；卡片携带稳定的 `intent`，打开 canvas 时写入 `brief`。
- [x] 最近项目三张卡；首页/项目页共享 deterministic discovery fixture。
- [x] Agent 空提示词禁用发送；文本草稿、Enter/点击发送和 Skill chip 选择有 E2E。
- [x] TV Show 分类、左右滚动、提交式搜索、匹配结果和无精确命中时的推荐回退。
- [x] 公开模式下保留浏览层，并提供登录门，不把 TV Show 隐藏为私有页面。

### 差距

- [ ] `HomeAgentComposer` 的附件按钮没有来源菜单；首页没有官网 Skill 页可见的模型/参考/生成模式完整上下文层。
- [ ] 登录门只导航到 local `/account`，而 `/account` 当前是积分账本，不是登录/注册或会话恢复页面。
- [ ] `HomeShowcaseItem` 与 `/showcase` 的 `ShowcaseEntryProjection` 仍是两套摘要类型；分类、作者、统计和播放/过程能力不能从同一条发现记录推导。
- [ ] 官网活动和模型组合会变化；需要保留版本化 campaign/tool fixture 与捕获日期，避免把一次首页文案当作永久产品枚举。
- [ ] 首屏网络失败、活动局部失败、TV Show 局部失败的降级体验尚未有单独视觉基线。

### 下一步验收

1. 为 composer 建立 `CreationContext` local contract：附件、模型、Skill、参考、生成模式均可打开、选择、移除，发送时序列化为稳定上下文。
2. 加入 `anonymous → login → returnTo` fixture，验证登录门关闭/刷新后草稿和当前入口仍能恢复。
3. 用一个 `DiscoveryEntry` 同时投影首页卡和 TV Show 卡；E2E 验证从首页卡打开详情后作者、分类和 process gate 一致。

## 2. Project (`/project`)

官网 `/project` 沿用活动条和侧栏，顶部顺序是返回、全部项目、搜索、回收站、新建文件夹。空态仍允许回收站和新建文件夹。

### 已覆盖

- [x] 四列桌面项目管理布局、收起侧栏后的宽度重排、开始创作卡和空态。
- [x] 项目/文件夹列表、搜索空态、文件夹进入/返回、回收站空态。
- [x] 项目和文件夹菜单：打开、重命名、封面、复制、移动、删除；删除项目和文件夹分别使用确认门。
- [x] 请求 loading、首次加载失败、陈旧数据刷新失败与重试反馈。
- [x] 空 workspace 下 `回收站`、`新建文件夹` 保持 enabled，符合官网只读观察。

### 差距

- [ ] 文件夹封面选择、项目移动、副本创建和文件夹完整生命周期已有代码路径，但当前主 E2E 没有一条端到端闭环证明持久化结果。
- [ ] 官网真实项目卡打开/新窗口/封面和分页细节未全部采集；当前截图只覆盖稳定首屏与菜单关键态。
- [ ] public mode 的“前往登录”仍进入账本页面；项目私有边界与登录后回跳尚未形成契约。
- [ ] 回收站只有空态主路径；恢复、永久删除和失败状态待补。

### 下一步验收

1. 添加 `project-manager-lifecycle.spec.ts`：创建项目 → 重命名 → 改封面 → 复制 → 移动文件夹 → 刷新 → 删除，并在每一步断言 API 结果与卡片状态。
2. 为回收站补空/有数据/恢复/永久删除四个 scenario；删除动作保留用户确认门。
3. 用共享 `IdentityState` 替代“去 `/account` 即登录”的隐式约定，记录 `returnTo=/project`。

## 3. Canvas / Workflow (`/canvas?...`)

官网项目画布是独立全屏编辑器，不继承首页/项目侧栏；顶部包含项目/画布、工作流/故事板、发布、积分、账户和 Agent，底部包含主工具轨与状态轨。详见 [2026-09-04 只读复核](pages/canvas/2026-09-04-live-project-readonly.md)。

### 已覆盖

- [x] 独立深色 shell、项目/画布切换、工作流/故事板双视图和 Agent 重排。
- [x] 添加节点菜单 taxonomy、空画布 starter、节点卡、媒体预览、端口、贝塞尔连线、选中与键盘删除。
- [x] 文本/图片/视频/音频/脚本/导演台/工具箱/素材库的 local fixture 节点入口。
- [x] viewport、缩放、小地图、连线显示、网格吸附、整理、撤销/重做和 revision 的 local reducer 语义。
- [x] 画布加载失败、错误提示、重试、并发租约驱逐和跟随状态的 local 交互。

### 差距

- [ ] 官网真实运行中的进度变化、停止、失败、重试、任务结果和积分预占/返还未做付费或真实生成观察。
- [ ] 动态模型权限、能力 rules、真实上传尺寸/类型限制和服务端错误仍以 mock/schema 为主。
- [ ] 本地已覆盖并发租约与跟随，但不等于真实多用户同时编辑时的冲突合并、断线重连和 cursor presence。
- [ ] 顶部发布/分享按钮与账户/积分入口仍是 local seam，不是共享账户域实现。

### 下一步验收

1. 为每种 Job 固定 `pending → running → succeeded/failed/cancelled` scenario，E2E 覆盖停止、重试、刷新后恢复和一次性 ledger 结算。
2. 用 server mock 注入网络断开、过期报价和能力不支持错误；验证节点状态和账本不重复扣费。
3. 以两个隔离浏览器验证同一 canvas 的 optimistic conflict、租约释放和回连，而不是只验证旧客户端被驱逐。

## 4. Storyboard（canvas 内的第二个 view）

官网故事板按音频、文本、图片、视频组织同一画布的读取投影；不是第二份可持久化工作流。有效输入、媒体生成和剪辑导出仍是未完整观察区域。

### 已覆盖

- [x] `projectStoryboard()` 从同一 `WorkflowDocument` 投影列；切换不改 revision/document。
- [x] 动态文本/音频左轨、图片和视频列；视频全部/成片/片段筛选；单列展开。
- [x] 媒体详情、参考元素回溯、在工作流中定位、创建副本、Agent 上下文 chip。
- [x] 空态、Agent 打开后的 340px 左轨重排和 ClipEditor 入口。

### 差距

- [ ] 官网有效输入下的时间线、转场、字幕、导出成功/失败/取消尚未获得同等级网络证据。
- [ ] 本地 compositor 可以 deterministic render，但“导出结果是否回写同一 project/canvas”还需要明确契约测试。
- [ ] 真实媒体缺失、权限变化、源节点删除后的 orphan card 和恢复流程待补。

### 下一步验收

1. 固定含文本/音频/图片/视频的混合 scenario，验证 workflow ↔ storyboard ↔ refresh 后节点数量、边和 revision 一致。
2. 给 ClipEditor 增加导出成功、取消、渲染失败和重试 fixture，明确 output asset 与源节点关系。
3. 对删除源节点、移除 artifact、失效 media URL 增加故事板降级卡，而不是让列静默消失。

## 5. Skills (`/skills` local；官网 `/skill`)

官网当前入口是 [`https://www.liblib.tv/skill`](https://www.liblib.tv/skill)，公开首屏标题、创作输入、Skill/收藏/我的、分类、搜索、Skill 卡和 `使用` 动作。local 为 `/skills` 与 `/skills/:skillId`，路径是本地产品契约而不是官网路径复刻。

### 已覆盖

- [x] 深色 Skill 市场首屏、宣传条、创作输入、三集合 tab、分类和搜索。
- [x] 版本化 `Skill`/`SkillCard`、官方/社区/个人 origin、稳定 slash 语义、作者、使用量、标签和结构化执行规范。
- [x] 收藏/取消收藏持久到 local workspace，错误/重试和收藏/我的空态有状态模型。
- [x] 详情页元数据、四图轮播、缩略图、原图 lightbox、Escape、分享提示、添加到 composer、立即使用登录门。
- [x] 受控 1440×900 Playwright 基线覆盖市场收藏态与详情轮播态；断言使用 local fixture、CSS-scale 截图、禁用动画和隐藏光标。

### 差距

- [ ] 市场顶部三个 composer 按钮（附件、选择 Skill、添加参考）只有视觉控件，没有打开菜单、选择和移除语义。
- [ ] “立即使用”只打开认证门；没有登录后把固定版本注入 Agent 会话、创建项目、执行确认和回写产物的闭环。
- [ ] “我的”只有查询/空态，作者创建、编辑、文件树、版本、审核、发布、下架无 local route。
- [ ] 目录底部固定“没有更多了”，没有分页/加载更多/目录失效或版本不可用状态。
- [ ] 分享为 tooltip，不是官网可能存在的系统分享/复制成功反馈；需要保持“观察到什么就实现什么”。

### 下一步验收

1. 复用首页 `CreationContext`，让 Skill 页 composer 的四类上下文全部可操作；从详情“添加 Skill”后回到 composer 仍保留版本。
2. 建立 `SkillSessionCommand` fixture：登录门 → 会话注入 → 确认 → pending → result/error；运行快照固定 `skillId + version`。
3. 先实现 authoring 的最小 `create → draft → version → publish` 本地 contract，再加无效 Skill/失效版本/权限不足状态。
4. 决定并记录 `/skill` alias 是否需要；不把路由兼容误判为 visual parity。

## 6. TV Show（首页流 + `/showcase` 目录/详情）

官网首页公开 TV Show 直接展示分类轨、搜索和作品卡；已归档的详情证据还包括沉浸式播放器、相邻作品、只读 workflow/storyboard 和复制登录门。

### 已覆盖

- [x] 首页六条本地公开作品、分类/搜索/推荐回退、部分 process disabled 语义。
- [x] `/showcase` 独立目录、分类、提交式搜索、卡片作者/等级/统计/节点数、loading/error/stale-error/empty 状态。
- [x] 详情沉浸背景、观看、播放/暂停、进度、倍速、质量菜单、音量和全屏。
- [x] 公开工作流/故事板只读覆盖、过程关闭、复制项目登录门、喜欢登录门。
- [x] `PublishedSnapshot` 与 `ShowcaseEntryProjection` 分层；公共 fixture 不依赖远端媒体。
- [x] 受控 1440×900 Playwright 基线覆盖 TV Show 目录、详情和匿名复制登录门。

### 差距

- [ ] 首页 `HomeShowcaseItem` 与目录 projection 仍可能出现内容数量、字段和入口不同步。
- [ ] `/showcase` 当前是本地产品自有路由；官网公开首页没有在 HTML 中暴露稳定目录/详情 URL，真实链接规则待确认。
- [ ] 目录分页/无限滚动、搜索加载态、后端空集合、播放缓冲、媒体失败、字幕/多音轨未覆盖。
- [ ] 认证后的复制没有目标 workspace、成功副本、进度、错误和资源归属状态；喜欢/分享没有登录后反馈。
- [ ] local screenshot 旧文件有 `2880×1800` 物理尺寸；如果验收要求文件本身 `1440×900`，必须用 `scale: 'css'` 和 `deviceScaleFactor: 1` 重采。

### 下一步验收

1. 定义唯一 `DiscoveryEntry` 与 `ShowcaseDetailProjection`，首页、目录、详情三处只消费 projection，不从 snapshot 现场拼字段。
2. 加入分页 cursor、刷新失败保留旧数据、媒体 ready/buffering/error、播放器重试等 local fixtures。
3. 加入已登录复制成功与资源克隆失败两条不付费 E2E；禁止以“点击了复制”代替归属结果。

## 7. Account（官网头像菜单 + local `/account` 账本）

官网账户并非单独的 ledger page，而是头像菜单内的身份、会员、积分、存储、主题、水印、通知、个人中心、CLI & Skill 和退出入口。local `/account` 当前专注可解释积分账本。

### 已覆盖

- [x] local balance、earned/spent/returned、held reservation、job link、分页加载更多。
- [x] 首次 loading、刷新、陈旧数据保留、首次错误和 retry 状态；单元测试覆盖状态文案。
- [x] 账本与 Jobs/ledger domain projection 分层，避免 UI 直接重算 charge。
- [x] 官网账户菜单、暗色主题、水印规则、通知和个人中心的只读截图已归档。
- [x] 受控 1440×900 Playwright 基线覆盖深色身份菜单，以及切换浅色/水印/通知后的偏好状态；身份信息保持脱敏。

### 差距

- [ ] `/account` 仍以账本为主；身份菜单中的团队、会员权益、存储空间和外部链接尚未在独立账户页形成完整投影。
- [ ] 个人中心资料与发布/点赞 tab 尚未形成 local contract。
- [ ] 订阅/开发票、模型超市、共享资产和团队/席位属于独立账户域，不能继续用 `/account` 静态入口代替。
- [ ] Access key 只应由专用测试凭据或脱敏状态验证；不要把真实值写入 fixture、截图或日志。
- [ ] 没有官网账户会话过期、跨设备退出、账号注销和数据导出证据。

### 下一步验收

1. 先建 `LocalIdentity`、`Preferences`、`NotificationSummary` 三个 mock projection，在首页头像菜单与 canvas 顶栏复用。
2. 将积分账本作为菜单中的一个可展开域，而非把账本页当作完整账户页；菜单键盘/Escape、焦点回收、刷新错误各有 E2E。
3. 对主题、水印、通知、团队和 Access key 生命周期逐项确定“已观察 / 待确认 / 不执行”的证据等级。

## 跨页回归核对

- [ ] 首页 Skill chip → Skills detail → 添加到 composer → 登录门 → 返回原上下文。
- [ ] 首页 TV Show card → Showcase detail → 播放 → 只读过程 → Storyboard → 复制登录门。
- [ ] Project card → Canvas → Workflow/Storyboard → 刷新，document/revision 保持一致。
- [ ] Canvas 生成确认门 → Job 状态 → Ledger held/settled/released → Account 账本定位。
- [x] 1440×900 七个 surface 各有一张首屏基线；Skills、TV Show 和 Account 的关键 menu/dialog 另有受控状态图。见 [visual regression index](../../screenshots/SCREENSHOT_INDEX.md)。
