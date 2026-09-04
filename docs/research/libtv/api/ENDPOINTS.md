# LibTV 官网 API 证据索引

本目录记录 LibTV 官网实际触发的网络请求，以及当前线上部署客户端明确构造/消费的协议
字段；两类证据必须分别标注，不把静态客户端事实冒充成真实响应。它不是对服务端内部实现
的推断，也不是 NovaVideo 的最终 OpenAPI。正式 mock/后端契约位于 `docs/api/`，需在官网
证据稳定后从这里归一化。

## 证据规则

- `network-confirmed`：由官网页面动作真实触发，并观察到方法、URL 与响应状态；
- `shape-confirmed`：进一步读取了脱敏后的 request/response 字段结构；
- `bundle-confirmed`：当前线上部署客户端明确构造或消费该字段，但尚未触发对应付费动作；
- `interaction-linked`：已经确认某项可见 UI 消费该请求；
- 捕获中不保存 Cookie、Token、Access Key、手机号、账户标识、项目标识或原始用户数据；
- `trace_id`、推荐 `requestId` 和用户 UUID 只记录字段存在，不保存值；
- 动态营销、作品和 Skill 内容只用于确定数据结构，不作为静态前端枚举。

## 捕获批次

| 日期 | 页面/动作 | 登录态 | 记录 |
|---|---|---:|---|
| 2026-09-03 | `/` 首页刷新 | 是 | [首页刷新](captures/2026-09-03-home-refresh.md) |
| 2026-09-03 | `/project` 全部项目 | 是 | [项目列表](captures/2026-09-03-project-list.md) |
| 2026-09-03 | `/canvas` 画布初始化 | 是 | [画布初始化](captures/2026-09-03-canvas-bootstrap.md) |
| 2026-09-03 | Workflow Video 节点 / 生成任务客户端 | 是 | [Video 任务协议](captures/2026-09-03-video-task-client-contract.md) |
| 2026-09-03 | Workflow Text / 手写 / 三个 starter | 是 | [Text 创作与持久化](captures/2026-09-03-text-authoring.md) |

## 当前已确认端点

### LibTV 产品域：`https://api.liblib.tv`

| 方法 | 路径 | 首页用途 | 证据 |
|---|---|---|---|
| `GET` | `/api/whitelist/check?uuid=<USER_UUID>` | 当前账户白名单能力判断 | `network-confirmed` |
| `GET` | `/api/community/skill/tag/list?parentTagId=0` | 首页 Skill 分类 | `shape-confirmed` |
| `POST` | `/api/community/tag/list` | TV Show 分类 | `shape-confirmed` |
| `POST` | `/api/community/user/verify/pending` | 社区身份审核状态 | `network-confirmed` |
| `POST` | `/api/community/skill/template/feed/stream` | 首页推荐 Skill | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/community/project/template/feed/stream` | TV Show 作品流 | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/canvas/project/list` | 最近项目查询的一部分 | `shape-confirmed` |
| `POST` | `/api/canvas/folder/entries` | 最近文件夹查询 | `shape-confirmed`, `interaction-linked` |
| `GET` | `/api/canvas/project/detail-by-space?spaceId=<SPACE_ID>&projectUuid=<PROJECT_UUID>` | 初始化项目、权限、节点与连线 | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/canvas/project/draft/update` | 保存项目草稿与当前视口 | `shape-confirmed` |
| `POST` | `/api/canvas/nodes/batch` | 当前细粒度节点、连线与 Text starter 批量持久化 | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/canvas/project/heartbeat` | 维持当前项目编辑会话 | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/progress/batch` | 批量同步生成任务进度 | `shape-confirmed` |
| `POST` | `/api/task/generation/create` | 创建单个生成任务 | `bundle-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/progress` | 读取指定任务进度与结果 | `bundle-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/stop/batch` | 批量停止生成任务 | `bundle-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/power/calculator` | 单个生成请求算力报价；Text 响应确认 `data.power` | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/task/generation/power/calculator/batch` | 批量生成请求算力报价 | `bundle-confirmed` |
| `POST` | `/api/task/generation/video/opt` | Video 任务优化入口 | `bundle-confirmed`；字段待捕获 |
| `POST` | `/api/agreement/check` | 检查功能协议签署状态 | `shape-confirmed` |

`/api/canvas/project/draft/update` 来自初始化批次与项目级草稿/视口保存；当前 Text 单节点编辑和
starter 实例化则直接观察到 `/api/canvas/nodes/batch`。两者的存在不代表本地需要暴露两套领域
写入 API；本地仍统一为带 `expectedRevision` 的 Canvas mutation。字段级脱敏记录见
[Text 创作与持久化](captures/2026-09-03-text-authoring.md)。

### LibTV Agent 会话域：`https://im.liblib.tv`

| 方法 | 路径 | 画布用途 | 证据 |
|---|---|---|---|
| `GET` | `/api/v1/project/session/list?projectId=<PROJECT_ID>` | 初始化项目的 Agent 会话列表 | `shape-confirmed`, `interaction-linked` |

### LibLib 账户与营销域：`https://api2.liblib.art`

| 方法 | 路径 | 首页用途 | 证据 |
|---|---|---|---|
| `GET` | `/api/www/account/list` | 可用账户/空间列表 | `shape-confirmed` |
| `GET` | `/api/www/member/account?isApp=false` | 会员、积分、Agent 免费次数与配额 | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/www/tv/msg/msgCounter` | 顶栏通知计数 | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/www/banner/community/getBanner` | 首页 Banner | `shape-confirmed`, `interaction-linked` |
| `POST` | `/api/www/user/remove-watermark/get` | 水印偏好 | `network-confirmed` |
| `GET` | `/api/www/user-group/bestGroup` | 当前团队/用户组 | `network-confirmed` |
| `POST` | `/api/www/teams/invite/myInviteList` | 团队邀请状态 | `network-confirmed` |
| `GET` | `/api/www/member/packages?packageType=TRAIN&sourceFrom=libtv` | 个人会员方案 | `network-confirmed` |
| `GET` | `/api/www/member/packages?packageType=TEAM&sourceFrom=libtv` | 团队会员方案 | `network-confirmed` |
| `GET` | `/api/www/member/memberPower/list` | 积分/权益明细 | `network-confirmed` |
| `POST` | `/api/www/member/libtvFreePower` | LibTV 免费额度 | `network-confirmed` |
| `GET` | `/api/www/commerce/activity/benefit` | 活动权益 | `network-confirmed` |
| `GET` | `/api/www/commerce/activity/benefit/list` | 活动权益列表 | `network-confirmed` |
| `GET` | `/api/www/commerce/activity/rateLimitBenefit` | 活动限额权益 | `network-confirmed` |
| `POST` | `/api/www/commerce/activity/promotion/query` | 当前促销 | `network-confirmed` |
| `GET` | `/api/www/paywall/popup-info` | 付费墙弹层配置 | `network-confirmed` |
| `GET` | `/api/www/landing-activities/getById` | 单个活动配置 | `network-confirmed` |
| `GET` | `/api/www/landing-activities/listByIds` | 指定活动集合 | `network-confirmed` |
| `POST` | `/api/www/landing-activities/list` | 活动列表 | `network-confirmed` |

`/api/www/log/acceptor/f` 是分析埋点，不进入前端业务 mock 契约。官网还加载
`https://www.liblib.art/cross-storage-hub.html` 用于跨域账户状态协作；该页面只作为
认证架构证据，不复制其存储内容。

## 下一批捕获顺序

1. 项目创建、项目卡菜单、重命名、文件夹与分页的单动作请求；
2. `/api/canvas/nodes/batch` 的并发冲突、删除与跨节点类型差异；
3. 故事板投影与媒体详情；
4. Video/Text 真实生成确认、进度、取消和成功/失败网络样本；
5. 视频合成器有效时间线、导出请求与失败响应；
6. Agent、素材、Skill、TV Show 和账户页面。
