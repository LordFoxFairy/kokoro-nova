# 账户与全局菜单

本页记录登录后的账户入口、共享账户域和设置状态。研究没有打开 Access Key、
复制 UUID、退出登录、创建付费团队或保存任何设置。

## 账户菜单

触发路径：登录首页 -> 右上角头像。

截图：

- [profile-menu-authenticated-overview.png](screenshots/profile-menu-authenticated-overview.png)
- [profile-menu-dark-mode.png](screenshots/profile-menu-dark-mode.png)

已观察结构：

- 身份区展示已脱敏账号、UUID 和 Access Key 入口，以及“创建团队”。
- 权益区展示用户等级、活动权益、会员入口和“查看更多”。
- 钱包区展示积分总额、通用/LibTV 来源拆分、充值和消耗顺序。
- 存储区展示已用/总空间，并链接到 LiblibAI 共享资产页。
- 全局动作包括个人中心、订阅与开发票、模式切换、AI 水印、CLI & Skill、
  通知和退出登录。
- 模式切换是即时的亮/暗主题选择；深色态截图后已恢复亮色，不改变其他设置。

“创建团队”在当前免费账户下不是直接创建表单，而是打开团队版会员方案弹层。
因此团队创建需要先满足付费 entitlement；实际成员邀请、角色和团队创建成功态仍待补。

## AI 水印设置

触发路径：头像 -> AI 水印设置。

截图：
[ai-watermark-removal-rules-and-toggle.png](screenshots/ai-watermark-removal-rules-and-toggle.png)

- 弹层先展示 AI 生成内容水印管理规则，再提供“去 AI 水印”开关和保存动作。
- 页面明确要求：发布未带显式水印的 AI 内容时，用户仍需依法主动声明并完成标识。
- 开启后，本账号后续生成内容不再添加“AI 生成”明水印。
- 本轮没有切换开关或保存；截图只证明规则、入口和待保存状态。

## 通知中心

触发路径：头像 -> 通知。

截图：

- [notifications-official-tab-unread-message.png](screenshots/notifications-official-tab-unread-message.png)
- [notifications-received-likes-empty-state.png](screenshots/notifications-received-likes-empty-state.png)

通知中心包含“官方通知”和“收到的喜欢”两个集合，以及“一键已读”。官方通知带
未读计数、标题、时间、正文和展开动作；收到的喜欢当前为空。本轮没有点击一键已读，
因此未改变未读状态。

## 个人中心

触发路径：头像 -> 个人中心。入口在新标签打开 LiblibAI 共享作者主页；稳定路由语义
为 `/userpage/:userId/...`，文档不记录真实用户 ID。

截图：

- [personal-center-published-models-empty.png](screenshots/personal-center-published-models-empty.png)
- [personal-center-published-libtv-empty.png](screenshots/personal-center-published-libtv-empty.png)
- [personal-center-liked-models-empty.png](screenshots/personal-center-liked-models-empty.png)
- [personal-center-edit-profile-fields.png](screenshots/personal-center-edit-profile-fields.png)

已观察：

- 作者摘要包含头像、脱敏用户名、粉丝、关注、作品被使用次数和获赞次数。
- 内容按“发布/点赞”分组，再按模型、工作流、图片、视频和 LibTV 类型切换。
- 发布态提供类型、状态、排序和日期筛选；点赞态提供类型与排序筛选。
- 编辑资料支持头像、用户名、简介、小红书/抖音/B 站/微博/其他网站链接，以及
  个性化推荐开关。
- 本轮只打开并取消编辑，没有复制 UUID、改资料或确认保存。

## 外部账户域

以下入口从 LibTV 新开 `liblib.art` 页面，并复用同一登录态：

| LibTV 入口 | 共享账户页 | 页面职责 |
| --- | --- | --- |
| 积分余额 | `/calculation` | 余额池和获取/消耗/返还明细 |
| 管理资产 | `/asset` | 跨生成器来源的资产集合 |
| 个人中心 | `/userpage/:userId/...` | 发布、点赞和作者资料 |
| 订阅与开发票 | `/transaction` | 订阅计划、购买记录和发票入口 |

这说明复刻中的 Identity、Wallet、Asset、Subscription/Invoice 应是可被 LibTV、
主站和外部 Agent 共同使用的账户域能力，而不是只挂在 Agent 会话下。

## CLI 与凭据边界

头像菜单的“CLI & Skill”打开登录后的 `/cli` 页面。安装和命令契约见
[LibTV CLI 契约](../../references/libtv-cli/)。Access Key 入口已确认存在，但为避免
凭据泄露，本轮没有打开、复制或截图密钥值。

## 登录态研究运行说明

Playwright 登录态保存在被 Git 忽略的本地自动化目录，文件权限为 `600`。后续自动化
可先加载该 storage state，若站点主动过期或撤销会话才需要重新登录。可能公开发布的
研究文档和截图不记录精确文件名，也不保存 Cookie、Token 或验证码。

2026-07-22 在用户重新登录后已覆盖保存，并用全新 Playwright 会话冷启动验证：加载
该状态后直接进入 `/project`，可见登录账户的项目列表，无需再次扫码或输入凭据。

## 复刻意义

- 用户、团队、凭据、计费和存储是独立领域，不应塞入 Agent 会话模型。
- Access Key 是 CLI/外部 Agent 接入的认证边界，必须支持作用域、撤销和审计。
- 积分存在不同余额池及消耗顺序，任务计费需要可解释 ledger，而非单一数字字段。
- 主题、水印和推荐策略都是持久偏好；变更需要服务端或同步存储，而非只改本地 UI。
- 通知应按类别、未读状态和关联对象建模，并与浏览器通知/声音偏好分离。

## 待补状态

- 已付费用户创建团队、邀请成员、角色权限、席位和团队切换。
- Access Key 创建、展示、轮换、撤销和权限范围，仅可用脱敏或专用测试凭据验证。
- 通知详情跳转、分页、全部已读、错误与实时到达。
- 已有发布/点赞内容时的筛选、分页、状态和批量操作。
- 账户会话过期、跨设备退出、账号注销和数据导出。
