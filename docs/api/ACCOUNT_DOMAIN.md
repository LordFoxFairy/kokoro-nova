# 共享账户域

`GET /api/account` 为 LibTV 账户中心提供确定性的本地 Identity、Wallet、Membership、
Preferences 和 Notifications 投影。它与 `GET /api/ledger` 分离：钱包的
`availableCredits` 由同一 workspace balance 计算，账本仍由 ledger 的 reserve → settle/release
projection 提供，避免账户导航或会员展示改写积分事实源。

## UI 对应

| 区域 | 本地字段/状态 | 行为 |
|---|---|---|
| 身份卡 | `identity` | 展示脱敏账号、UUID、Access Key 入口和创建团队入口 |
| 钱包 | `wallet` + `/api/ledger` | 展示通用/LibTV 来源、充值入口和 reserve/settle/release 明细 |
| 会员 | `membership` | 展示当前权益、折扣和订阅/开发票入口 |
| 通知 | `notifications`、`unreadCount` | 官方通知/收到的喜欢两个集合和一键已读入口 |
| 偏好 | `preferences` | 主题即时切换；水印与个性化推荐为本地浏览器状态 |
| CLI & Skill | `GET/POST /api/access-key` | 创建、轮换、撤销的脱敏 Access Key 生命周期与固定作用域 |

账户导航使用垂直 `tablist` 的 roving tabindex：`ArrowUp/ArrowDown` 循环移动，`Home/End`
跳到首尾，焦点始终留在当前 tab。`?tab=store` 和 `?tab=membership` 保留已有入口兼容性。

## 确定性边界

- `GET /api/account` 读取持久化的本地会话状态：本地退出后返回公开浏览者身份、0 积分和空通知；本地登录后返回固定的脱敏身份。scenario 不决定登录状态。
- 会员、通知和存储值固定；已登录钱包余额读取当前 scenario 的 ledger tail。
- 偏好保存到当前浏览器的 `libtv.account.theme`、`libtv.account.watermark` 和
  `libtv.account.recommendations`，没有写入真实凭据或远端账户。
- Access Key 命令、团队邀请/成员角色更新与订阅/发票/模型市场 handoff 见 [`ACCOUNT_EXTERNAL_COMMANDS.md`](ACCOUNT_EXTERNAL_COMMANDS.md)；它们均为确定性本地 projection，不读取 Cookie、Token、真实密钥、支付资料或外部目录 URL。
