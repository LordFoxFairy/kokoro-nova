# Team & Shared Assets Contract

账户中心的“团队与共享资产”是独立于个人 Asset Library 的只读 projection。当前只服务
frontend-only 的确定性 local fixture：不读取团队成员、邀请、Cookie、Token、真实文件地址或
LibTV 账户数据。

## Operations

| Operation | Path | 成功体 | UI 用途 |
|---|---|---|---|
| `getLocalTeam` | `GET /api/team` | `TeamResponse` | 团队名称、当前角色、席位、成员摘要和 pending invite。 |
| `getLocalSharedAssets` | `GET /api/shared-assets` | `SharedAssetsResponse` | 共享素材名称、媒介种类、来源成员、最后更新时间和局部权限。 |
| `createLocalTeamInvite` | `POST /api/team/invites` | `CreateTeamInviteResponse` | 以 local alias 创建确定性的 pending invite。 |
| `updateLocalTeamMember` | `PATCH /api/team/members/{memberId}` | `TeamMemberUpdateResponse` | 将非 owner 成员在 `admin` / `member` 间切换。 |

两个读取 operation 都没有请求体、分页 cursor 或写入副作用；命令 operation 均要求 `idempotencyKey`，不会解析邮箱、真实成员 ID 或外部 URL。`/api/assets` 仍然是个人/Agent 资产库的
可变生命周期边界；共享资产不复用其编辑、上传或删除 endpoint。

成员更新的资源级失败使用 `404 ErrorResponse`（稳定 code 为 `NOT_FOUND`）：它表示路径中的
`memberId` 不属于当前本地 team；`403` 仍专用于尝试修改 owner，`409` 专用于团队/幂等状态冲突。
当前 mock 兼容层仍可能发送 legacy error shape；这里的 `ErrorResponse` 是未来服务端与 adapter 的
规范化交接目标，详见 [`ERRORS.md`](ERRORS.md)。

## State machine

`state` 是 UI 和后端之间的稳定联合：

| state | `team` / `assets` | local fixture | UI |
|---|---|---|---|
| `ready` | `team` 非空；共享列表可为非空 | `authenticated-populated` | 显示团队、席位、成员、资产和 `owner/edit/comment/view` 权限。 |
| `empty` | `team: null`；`assets: []` | `authenticated-empty` | 显示“尚未加入团队”和资产空态。 |
| `permission-denied` | `team: null`；`assets: []` | anonymous、public-showcase、账户选择门或本地退出后 | 显示登录门，不泄露成员或资产字段。 |

网络错误不伪装成业务状态：账户 UI 保留已读取的 team/shared-assets projection，显示 `role=alert`
并让用户重试同一组 GET。首次加载使用具名 `role=status`。这使加载、空态、权限门和可恢复错误
在 E2E 中可分别验证。

## Stable fixture

`authenticated-populated` 固定返回 `team_kokoro_creative`（`Kokoro 创作组`、3/5 席位）和两个
fixture-relative 资产：`shared_asset_city_board`（`edit`）与 `shared_asset_voice_over`（`view`）。
时间固定为 ISO 8601 字面量，缩略图路径仅指向 `/fixtures/...`。任何 future adapter 都不得把真实
外站或签名 URL 下沉到这个 UI contract。

## Backend handoff

1. 使用 Team membership repository 替换 scenario projection；保持 `TeamResponse` 的三态与 `team`
   可空不变量，不让组件根据 401/404 猜测空态。
2. 使用 ACL-aware asset index 替换 `SharedAssetsResponse.assets`；每个资产应在 query 内完成成员权限
   过滤，响应只返回调用者已可见的 `permission`。
3. 本地邀请和成员角色命令只覆盖 UI 边界；真实服务需将 alias 换为 principal/directory lookup，并补充投递、接受、撤回、审计和 optimistic revision。详细命令状态见 [`ACCOUNT_EXTERNAL_COMMANDS.md`](ACCOUNT_EXTERNAL_COMMANDS.md)。
4. 真实认证失败可在 transport adapter 标准化为 `permission-denied` view state；服务端仍按
   OpenAPI operation 的 bearer/owner 语义记录 401/403。
5. 后端替换后继续通过 `TeamResponseSchema`、`SharedAssetsResponseSchema`、route tests、账户 E2E 和
   `node scripts/verify-api-contract.mjs`。
