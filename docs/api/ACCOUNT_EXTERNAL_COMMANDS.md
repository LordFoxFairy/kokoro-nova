# Account external-command handoff

本文件覆盖账户中心中不属于本地画布、项目或积分账本事实源的命令边界。当前仓库是
frontend-only 的确定性 fixture：所有响应为脱敏 projection，绝不签发、读取、持久化或展示真实
Access Key、Cookie、支付资料、邮箱地址或第三方模型市场 URL。

## Operations

| Operation | Path | Local behavior | Future owner |
|---|---|---|---|
| `getLocalAccessKey` | `GET /api/access-key` | 读取 `not-created \| active \| revoked` 脱敏生命周期。 | credential issuer |
| `commandLocalAccessKey` | `POST /api/access-key` | `create \| rotate \| revoke`；要求 `idempotencyKey`，只返回掩码和 generation。 | credential issuer + audit log |
| `getAccountExternalHandoffs` | `GET /api/account/handoffs` | 显式投影订阅、发票、模型市场的 handoff / 空态 / 登录门。 | billing, invoice, model catalogue |
| `createLocalTeamInvite` | `POST /api/team/invites` | 以本地 `inviteeAlias` 创建 pending invite，不解析邮箱或投递。 | membership directory + delivery |
| `updateLocalTeamMember` | `PATCH /api/team/members/{memberId}` | 更新非 owner 的 `admin \| member` 角色。 | membership ACL + audit log |

## Access Key state machine

```text
not-created --create--> active --rotate--> active (generation + 1)
                               \--revoke--> revoked --create--> active (generation + 1)
```

- `AccessKeyProjection.maskedValue` 是固定掩码；API 不包含 secret、reveal、copy 或下载字段。
- `createdAt`/`revokedAt` 是 fixture 固定时钟，便于视觉与 E2E 重放；不是签发时间事实源。
- 同一 `idempotencyKey` 重放同一 command 返回相同 response；复用该 key 提交另一 command 返回 `409`。
- 非 authenticated session 读取/命令返回 `401`，不会降级返回旧 Key projection。

## Team command boundary

`GET /api/team` 仍然是成员与共享资产的 projection；它现在包含 `pendingInvites`，使邀请后刷新可见。
`POST /api/team/invites` 不接收 `email`、`userId` 或外部 URL，只接收本地演示的 `inviteeAlias`。
邀请不会立即占用 `seatCount`，但 pending invite 也受剩余 seat 限制；相同 `idempotencyKey` 可安全重放。

`PATCH /api/team/members/{memberId}` 仅允许 `admin` 与 `member` 互换；owner 被拒绝为 `403`。真实后端接手时应：

1. 以 workspace owner/管理员授权和成员 revision 校验替代 fixture 判断；
2. 用 principal ID + 审计事件 + 幂等键替代 `inviteeAlias`；
3. 在异步投递、过期、接受、撤回之间维护 invitation state；
4. 保持 `TeamResponse` 的 `ready|empty|permission-denied` 投影不变量和显式 pending 列表。

可执行的确定性样本将请求、成功响应和其 fixture transition 锁定在一起：

- [创建 pending 团队邀请请求](examples/team-invite.request.json) / [响应](examples/team-invite.response.json)
- [更新成员角色请求](examples/team-member-update.request.json) / [响应](examples/team-member-update.response.json)

两条写命令均把 `idempotencyKey` 放在 JSON body。相同 key 与相同输入重放原 response；相同 key
与不同输入返回 `409`。匿名会话返回 `401`；owner role 更新返回 `403`；未知成员返回 `404`。这些是
本地 fixture 的稳定错误语义，未来 membership service 应保留 status/code 映射并改用真实 principal 与审计事件。

## Subscription, invoice and model-market handoff

`GET /api/account/handoffs` 返回单一账号外部服务 projection：

| Service | authenticated fixture | anonymous fixture | No local side effect |
|---|---|---|---|
| subscription | `handoff-ready`, owner `billing` | `authentication-required` | 不创建订单、订阅或支付 intent |
| invoices | `empty`, owner `invoice` | `authentication-required` | 不读取购买历史、不生成发票 |
| model market | `handoff-ready`, owner `model-market` | `authentication-required` | 不调用远端目录、不暴露 provider URL |

UI 只显示 owner、message、action label 与是否可继续；按钮反馈同一 projection message，不导航到外站。
未来 adapter 在 API 层接入 billing/invoice/catalogue 后，保留 `state`、`owner`、操作标签和错误映射，组件无需
读取环境变量或 bearer token。

## Verification

```bash
pnpm vitest run src/server/__tests__/account-boundaries.test.ts \
  src/app/api/access-key/route.test.ts
pnpm exec playwright test e2e/account.spec.ts -g 'Access Key|local alias invitation'
node scripts/verify-api-contract.mjs
```
