# Local Identity & Account Menu Contract

这份契约服务首页和 Canvas 顶栏共同的账户菜单；它不是既有 `/account` 积分账本的替代品。
所有数据均由确定性本地 fixture 驱动，严禁读取真实 Cookie、Token、Access Key 或官网账户数据。

## Operations

| Operation | Path | Meaning |
|---|---|---|
| `getLocalIdentity` | `GET /api/identity?returnTo=/...` | 返回登录状态、脱敏身份与安全的站内回跳地址。 |
| `updateLocalSession` | `POST /api/identity` | `signOut` 关闭本地会话；`signIn` 恢复会话并返回同一 `returnTo`。 |
| `getLocalPreferences` | `GET /api/preferences` | 读取亮/暗模式及 AI 水印偏好。 |
| `updateLocalPreferences` | `PATCH /api/preferences` | 局部更新 `theme`、`aiWatermark`。 |
| `getNotificationSummary` | `GET /api/notifications` | 返回账户菜单 badge 与最多三条通知预览。 |
| `markNotificationsRead` | `POST /api/notifications` | `{ "action": "markAllRead" }`，将本地未读数归零。 |

## Deterministic fixture

- 身份为 `微信用户cd385d`；UUID、账号、Access Key 都是脱敏固定字面量。
- Access Key 只呈现 `•••• •••• •••• ••••` 和创建/管理入口，API 不接受也不返回任何真实 Key。
- 账户菜单固定展示免费会员、活动权益、20 点积分及四种来源、`0.25 GB / 3 GB` 存储、个人中心、订阅与开发票、CLI & Skill、通知、前往 Liblib 与退出登录。
- `returnTo` 必须以单个 `/` 开头，禁止 `//HOST` 与 scheme；登录成功只导航回当前 Kokoro Nova 路径。
- 切换开发 scenario 会重置会话/通知至该 scenario 的确定性状态；显示和水印偏好作为本地用户偏好保留。

## UI state requirements

1. 头像 trigger 是普通 `<button>`，有 `aria-haspopup="menu"` 和 `aria-expanded`。
2. 打开后第一个可操作项获取焦点；`Escape` 关闭并把焦点还给 trigger；点击菜单外关闭。
3. 亮/暗模式和 AI 水印更新后立刻重渲染菜单，并通过 API 保留至刷新。
4. 退出后菜单原位展示“登录并返回”；登录后返回原路径，而不是跳到外站登录页。
