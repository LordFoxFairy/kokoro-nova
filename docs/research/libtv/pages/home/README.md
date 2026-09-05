# 首页

路径：`/`

## 页面职责

首页同时承担产品发现和创作启动：活动 Banner、自由提示词输入、
附件/模型/Skill/生成模式选择、快捷 Skill、开始创作、Seedance 快速体验
和 TV Show 内容流。

## 已观察状态

### 未登录态与登录入口

截图：[unauthenticated-overview-and-login-prompt.png](screenshots/unauthenticated-overview-and-login-prompt.png)

- 未登录用户仍可浏览首页和 TV Show 公开内容。
- 进入需要私有 workspace 的创作动作时打开统一登录层，支持手机号验证码、
  微信扫码和 QQ 扫码。
- 公开发现与私有创作是两层权限面，不应通过隐藏整个首页来实现鉴权。

### 登录二维码过期

截图：[login-dialog-qr-expired.png](screenshots/login-dialog-qr-expired.png)

- 登录弹层保持手机号验证码和扫码两组入口。
- 微信二维码过期后显示“二维码失效，请刷新”，需要显式恢复入口，不能让用户
  在不可用二维码上继续等待。

### 登录态总览

截图：[authenticated-overview.png](screenshots/authenticated-overview.png)

补充截图：
[authenticated-home-banner-and-creation-controls.png](screenshots/authenticated-home-banner-and-creation-controls.png)

- 顶部展示活动、挑战赛、帮助、会员、积分和账户入口。
- 核心输入区支持附件、模型、Skill 和生成模式四类上下文。
- 首页可从自然语言或预设 Skill 两条路径启动创作。
- TV Show 是公开作品发现入口，包含分类、搜索、作者和互动数据。

### 一比一桌面实现基准

以下截图统一使用 `1440x900` 视口，保留顶部活动条、全局导航、轮播、最近项目
和底部创作输入区的相对位置，可直接用于复刻桌面布局与浮层锚点：

- [登录态首页总览](screenshots/home-authenticated-canonical-desktop-1440x900-hires.png)
- [创作器聚焦空态](screenshots/home-composer-focused-empty-desktop-1440x900-hires.png)
- [有效草稿与启用发送](screenshots/home-composer-valid-draft-send-enabled-desktop-1440x900-hires.png)
- [附件来源菜单](screenshots/home-attachment-source-menu-desktop-1440x900-hires.png)
- [个人资产库空态](screenshots/home-attachment-personal-asset-library-empty-desktop-1440x900-hires.png)
- [图片/视频模型选择器](screenshots/home-model-selector-desktop-1440x900-hires.png)
- [视频模型页签](screenshots/home-model-selector-video-tab-desktop-1440x900-hires.png)
- [会话 Skill 选择器](screenshots/home-skill-selector-desktop-1440x900-hires.png)
- [收藏 Skill 空态](screenshots/home-skill-selector-favorites-empty-desktop-1440x900-hires.png)
- [我的 Skill 空态](screenshots/home-skill-selector-mine-empty-desktop-1440x900-hires.png)
- [手动/自动生成模式](screenshots/home-generation-mode-manual-vs-auto-desktop-1440x900-hires.png)

输入区获得焦点后展开为多行编辑器，四个上下文入口固定在左下方，发送动作固定在
右下方。附件和生成模式使用小型锚定菜单；模型与 Skill 使用更高、更宽且内部
滚动的目录面板。浮层不能改变输入区或最近项目区域的布局尺寸。

空输入时发送按钮禁用；输入有效文本后按钮立即启用。本轮只输入可清除的草稿并在
离开前恢复为空，没有点击发送，也没有创建项目或 Agent 会话。

### 附件来源

截图：[attachment-source-menu.png](screenshots/attachment-source-menu.png)

- 支持本地上传和从资产库添加。
- 文件上传与租户资产引用应收敛到统一 Asset Service，但保留不同入口与权限检查。
- “素材库添加”不是第二个小菜单，而是打开完整资产管理层：包含搜索、新建、上传，
  以及全部、其它、人物、场景、物品、风格、音效分类；当前账户显示空态。

### 模型选择

截图：[model-selector-image-and-video.png](screenshots/model-selector-image-and-video.png)

- 图片与视频模型分栏展示，目录会动态更新。
- 模型参数不应硬编码到页面；前端、CLI、Agent 和 worker 应消费同一版本化 schema。

本轮桌面态可见图片目录中的 Lib Navo Pro、Lib Image、Seedream 5.0 Pro、悠船
V8.1 等条目，以及视频目录中的 Seedance 2.0 VIP、Kling O3、Kling 3.0 等条目。
这些名称和排序属于动态产品数据，不应当作为前端枚举写死。

点击“视频”页签会把目录定位到视频分组，而不是进入新路由；截图中的面板同时保留
页签状态和 Seedance/Kling 模型卡，适合实现同一滚动目录中的分类导航。

### 会话 Skill 选择

截图：[home-skill-selector-desktop-1440x900-hires.png](screenshots/home-skill-selector-desktop-1440x900-hires.png)

- 面板提供“创建”“全部”、通用/收藏/我的、搜索、添加和详情入口。
- 每个条目同时显示展示名、Slash 标识和能力摘要，底部可跳转全部 Skill。
- 首页快捷 Skill 与面板目录是同一能力入口的两种投影，添加后应写入当前 Agent
  会话上下文，而不是创建一份独立 Skill 数据。
- 收藏和我的使用独立页签与相同搜索框；当前账户两者均显示“暂无 Skill”，不能在
  空态下回退展示通用目录，否则会破坏用户对私有范围的判断。

### 生成模式

截图：[generation-mode-manual-vs-auto.png](screenshots/generation-mode-manual-vs-auto.png)

- 手动：Agent 每次生成前询问。
- 自动：Agent 可完全自动生成并可能直接消耗积分。

## 待补状态

- 开始创作与 Seedance 快速体验后的路由差异。
- 首页错误、加载与网络断开状态。

## 2026-09-04 公开首页表面复核

本轮直接观察了当前官网首屏的可访问结构，确认活动条、侧栏、七个快捷创作入口、
Agent 起始器与 TV Show 搜索仍共同组成首页第一层。动态文案已变为 Seedance 2.5、
Wan 3.0 和 Minimax H3 Max 等当前组合；这进一步验证卡片与营销内容必须以 fixture/
配置承载。完整的可见 UI 证据、边界和本地映射见
[2026-09-04-public-surface.md](2026-09-04-public-surface.md)。空项目页的 toolbar、空态和
二级操作 enabled 语义另见
[2026-09-04-project-empty-surface.md](2026-09-04-project-empty-surface.md)。

2026-09-05 的公开首页复核进一步记录了当前快捷卡、空输入 Agent 的 disabled 语义、TV Show
卡片索引证据，以及本地 `/showcase` 不应被误认为官网真实 URL 的边界，见
[2026-09-05-public-home-readonly.md](2026-09-05-public-home-readonly.md)。

## 2026-09-03 当前官网复核

在已有登录会话中刷新官网首页，当前版本仍保持“快速创作入口 -> 最近项目 ->
LibTV Agent -> TV Show”的主层级。动态模型和活动文案已经变化，因此复刻应从 fixture
读取这些内容，而不是把当日名称写入组件。

本次同时确认首页从 `api.liblib.tv` 与 `api2.liblib.art` 两个域加载项目、文件夹、
Skill、作品流、会员、积分、通知和营销配置。脱敏后的接口与字段结构见：

- [API 证据索引](../../api/ENDPOINTS.md)
- [2026-09-03 登录态首页刷新](../../api/captures/2026-09-03-home-refresh.md)

新增的实现约束：

- 最近项目与最近文件夹是独立请求，不应由一个前端静态数组同时模拟；
- 推荐 Skill 按分类并行取小批量数据；
- TV Show 使用分页流和 `hasMore`；
- 账户摘要、消息计数与活动配置彼此独立，局部失败只降级对应区域。

### 2026-09-03 1440×900 登录态基准更新

当前构建在 `1440×900` 下已重新采集三张完整视口证据：

- [登录态首页当前基准](screenshots/home-authenticated-desktop-1440x900-2026-09-03.png)
- [全部项目当前基准](screenshots/project-authenticated-desktop-1440x900-2026-09-03.png)
- [全部项目侧栏收起态](screenshots/project-sidebar-collapsed-desktop-1440x900-2026-09-03.png)

当前桌面布局的直接测量约束：

- 活动条距视口四周 `8px`，高约 `48px`；应用主体从 `64px` 开始；
- 展开侧栏宽约 `232px`，收起后宽约 `68px`，主内容随侧栏重排而非被覆盖；
- 首页主内容左边界约 `280px`，顶栏工具右对齐，首屏 Banner 使用 `8:1` 原图并按
  可用宽度显示为约 `1120×140px`；
- 快速创作区为“一个大画布卡 + 右侧三列两行工具卡”，其后是三张最近项目横向卡；
- Agent 输入器位于最近项目下方并居中收窄，TV Show 独立进入下一内容段；
- 项目页标题栏依次为返回、标题、搜索、回收站、新建文件夹；内容区使用四列固定卡宽，
  第一张恒为开始创作，卡片元数据位于封面下方；
- 侧栏的首页、项目、Agent 和挑战赛属于全局导航；“新建项目”是独立高强调动作，
  会员/积分活动卡和帮助固定在侧栏底部。

本批同时把当前活动 Banner 和六张公开 TV Show 封面本地化到
`public/fixtures/libtv/`。来源、尺寸和本地路径记录在
[`assets/MANIFEST.json`](../../assets/MANIFEST.json)，页面与测试不得继续依赖远程 URL。
