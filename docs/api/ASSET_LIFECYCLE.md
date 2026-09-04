# Asset lifecycle contract

`Asset` 描述入库记录；`AssetLifecycleView` 是资产路由返回的完整可用性投影。未来后端必须
在 `GET /api/assets`、`POST /api/assets`、`PATCH /api/assets/{assetId}` 与
`DELETE /api/assets/{assetId}` 的成功响应中返回后者，而不是只返回 `Asset`。

## 两个独立维度

| 字段 | 含义 |
|---|---|
| `state` | 入库/保留状态：`staging`、`committed`、`revoked`。 |
| `lifecycle.availability` | 当前能否被画布、故事板和编辑器使用：`active`、`missing`、`deleted`、`recoverable`。 |

`state: committed` 且 `availability: active` 才是可插入素材。软删除保留源产物可追溯性，返回
`state: revoked` 与 `availability: recoverable`；客户端不得把它当作普通素材继续引用。

## 读取与动作

- `visibility=active|unavailable|all` 过滤可用性，缺省为 `active`。
- PATCH 的 `UpdateAssetRequest` 是二选一：元数据 patch（`name`、`tags`、`folderId`）或
  生命周期 action（`restore`、`mark-media-missing`）。两种 body 不可混用。
- 当生命周期不允许 action 时，服务端返回 `409 ErrorResponse`，而非静默成功。

`fixture=media-missing` 仅用于本地 mock 的确定性异常态演示和 Playwright 视觉基准。它不写入
用户状态，也不是未来生产后端的公开查询参数。

## 前端替换边界

`src/api/assets.ts` 使用 Zod 对 lifecycle list 与 action 响应进行运行时解析；真实后端接入时，
这些校验仍保留，以便在网络边界立即发现契约漂移。
