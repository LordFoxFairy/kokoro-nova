# 后端交接授权契约

`openapi.yaml` 的每个 operation 都声明了 `x-authorization` 和 operation-level `security`。这是一份未来后端的交接边界，不改变当前 frontend-only fixture：本地 Route Handler 不读取、验证或持久化真实凭证，也不调用远端模型或服务。

## Bearer scheme

受保护 operation 使用 OpenAPI `bearerAuth`：

```yaml
security:
  - bearerAuth: []
```

其类型为 HTTP bearer，`bearerFormat: JWT`。transport adapter 负责在后端部署时注入
`Authorization: Bearer <token>`；页面组件、WorkflowDocument、fixture、日志和 URL 均不得保存或读取 token。没有 bearer 或 bearer 无效时，后端返回 `401 UNAUTHENTICATED` 的规范化 `ErrorResponse`。

公开 operation 明确使用：

```yaml
security: []
x-authorization: public
```

这表示不要求 bearer；它不表示可返回私有 workspace、账户、草稿、会话或未发布资产。

## 授权级别

| `x-authorization` | `security` | 后端判定 | 资源可见性/写入边界 |
|---|---|---|---|
| `public` | `[]` | 无 bearer 要求 | 仅公开发现、目录、预览、已发布快照与其可公开媒体；不得借 path 或 ID 推断私有资源。 |
| `authenticated` | `bearerAuth` | bearer 的 subject 有效 | 只确认已登录身份；用于收藏、公开快照复制和开发 fixture 控制，不授予某个资源的所有权。 |
| `owner` | `bearerAuth` | subject 是个人资源的创建者/当前账户 | 账户、偏好、账本、Creation Context、Agent 会话、作者 Skill，以及发布/下架操作均只允许资源 owner。 |
| `workspace` | `bearerAuth` | subject 具有目标 workspace 的所需角色 | 项目、画布、资产、任务、回收站、Presence、合成和 Script V2 必须先解析资源归属，再按读/写角色授权。 |

`workspace` 读操作要求 workspace reader；创建、mutation、上传、删除、任务 transition 和
Presence heartbeat 要求 workspace editor。后端可实现更细粒度角色，但不得把 reader 自动提升为 editor。对不存在、不可见或无权资源的公开暴露策略见下节。

## Operation 分组

| 级别 | Operation 范围 |
|---|---|
| `public` | `GET /api/home`、`/api/models`、`/api/skills*`、`/api/materials*`、`/api/showcase*`、`GET /api/publish*`、预览和媒体读取。 |
| `authenticated` | 收藏 Skill/素材、`POST /api/publish/{snapshotId}/clone`、`/api/dev/scenario` 与 `/api/dev/reset`。开发 fixture 仍须同时通过环境门，production 不暴露。 |
| `owner` | `/api/account`、`/api/ledger`、`/api/identity`、`/api/preferences`、`/api/notifications`、`/api/creation-context`、`/api/agent/**`、`/api/skills/author/**` 以及发布/下架。 |
| `workspace` | `/api/projects*`、`/api/folders*`、`/api/recycle-bin*`、`/api/canvases*`、`/api/assets*`、`/api/jobs*`、`/api/compose`、`/api/presence*`、`/api/script-v2/**`。 |

`*` 仅表示同一路径族中已在 OpenAPI 列出的 operation；具体 method 的 authoritative 标注始终是
`openapi.yaml` 的 `x-authorization`。公开的 `GET /api/publish*` 只返回已发布投影；`POST`、`DELETE` 仍为 owner operation。`GET /api/media/{path}` 仅可返回已授权的公开投影或 bearer 所属 workspace 媒体，后端不得把本地 fixture 的相对路径模型照搬为跨租户文件系统访问。

## 401、403、404 的交接规则

- `401 UNAUTHENTICATED`：缺少、过期或无效 bearer；不要执行资源查询或泄露其存在性。
- `403 FORBIDDEN`：bearer 有效但不满足 owner/workspace 角色，或 fixture route 不满足开发环境门。
- `404 NOT_FOUND`：资源不存在；公开快照和公开媒体也可对不可见资源返回 404，以避免暴露已下架或私有对象。

所有三种响应均使用 [`ErrorResponse`](ERRORS.md#规范化-errorresponse-与迁移边界)。后端在授权通过后再执行业务校验、revision 检查、积分预留或副作用；客户端按稳定 error code 处理，不根据 message 推断权限。
