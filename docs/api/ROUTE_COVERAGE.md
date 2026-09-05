# Route 覆盖审计与后端替换边界

> Contract version: `1.25.1-account-member-not-found` · scope: 55 paths / 92 operations

此文档是 `route-manifest.ts`、`openapi.yaml` 与现有 Next.js Route Handler 的人工审计结果。
它只描述当前前端子仓库的确定性 mock 边界：不传递真实 LibTV URL、Cookie、token 或任何上游
凭证。每个 operation 都已经列入 route manifest，并由
`src/contracts/__tests__/openapi.test.ts` 校验 method/path、`operationId`、UI trigger、场景和 wire
transport 的一一对应。

## 覆盖结论

| 范围 | path / operation | OpenAPI schema | 确定性 mock 约定 | 后端接手边界 |
|---|---:|---|---|---|
| Project / Folder / Recycle Bin | 7 / 13 | 已精确 | 空账户、默认命名、软删除 30 天保留、恢复与永久删除确认 | project/folder repository |
| Canvas / workflow / Creation Context | 3 / 8 | 已精确 | revision、冲突、当前 document 与首页发送前上下文冻结 | document store + optimistic lock + context store |
| Jobs / Script V2 / compose | 7 / 11 | 已精确 | quote、poll、幂等、终态、取消/重试与 fixture | queue/provider/render adapter |
| Asset / media / preview | 7 / 11 | 已精确 | local fixture media、upload 暂存、soft delete | object storage + asset index |
| Catalogue | 7 / 12 | 已精确 | models、materials、市场/作者 Skill 的本地 catalogue | registry/catalogue service |
| Agent | 7 / 7 | 已精确 | 按 `afterSeq` 增量读取、固定版本 Skill、确认门与本地 fallback trace | agent gateway |
| Public discovery / publish | 8 / 11 | 已精确 | 首页、showcase、分页发现与冻结 public snapshot 私有复制 | discovery/publish service |
| Account / ledger / team | 11 / 15 | 已精确 | identity、会话、钱包、偏好、通知、Access Key、团队命令、共享资产与外部 handoff projection | shared account domain + billing/ledger/team service |
| Presence | 1 / 2 | 已补强 | SSE、heartbeat、TTL、连接上限 | shared realtime bus |
| Development fixtures | 2 / 3 | 已补强 | dev-only scenario/reset | 不部署到 production |

### 本轮 API-AUD-07 运行时 smoke 进度

- 资产库的低耦合主切片已由 `src/app/api/assets/route.test.ts` 直接执行：活跃/不可用 lifecycle 列表、资产文件夹创建与计数、元数据移动、软删除、恢复，以及缺失资产的标准 `404 ErrorResponse`。成功响应分别由 `AssetLifecycleListResponseSchema` / `AssetLifecycleViewSchema` 解析，避免只断言 HTTP status。
- 上传主切片已由 `src/app/api/assets/upload/route.test.ts` 直接执行：同一次 `multipart/form-data` ingress 的 committed 文件与逐文件拒绝项、随后 active listing、同一 `uploadToken` 的二次 ingress `409`，以及 cancel 后 `revoked: 1` / replay `revoked: 0`。上传/取消成功体由严格 Zod schema 解析，非法 cancel token 与冲突均解析标准 `ErrorResponse`。
- Canvas/workflow 主切片已由 `src/app/api/canvases/route.test.ts` 与 `src/app/api/canvases/[canvasId]/route.test.ts` 直接执行：新建/深拷贝画布、完整 canvas/project/jobs/balance 读取投影、重命名、非最后画布删除、revisioned mutation 回读与 stale revision `409`。同一切片还以 `setViewport` 后接无效 edge 的 batch 验证失败不提交任何 document/revision 变化；成功体经 `CanvasSchema` / `CanvasDetailLocalResponseSchema` / `MutationResultSchema` 解析，错误经 `LocalErrorEnvelopeSchema` 解析。
- 视频合成主切片也已由 `src/app/api/compose/route.test.ts` 直接执行：创建返回严格 `ComposeTaskResponse`，以受控 renderer 到达 `rendering` 后取消，重复 `cancel` 返回同一 terminal projection，并在后续 GET 中保持；非法 clips 与未知 task action 分别返回 schema-valid `400` / `404 ErrorResponse`。该测试不依赖 ffmpeg 或实际媒体输出。
- Agent session 的全部 7 个 operation 已由 `src/app/api/agent/sessions/route.test.ts` 与 `src/app/api/agent/sessions/[sessionId]/route.test.ts` 直接执行：新建/按项目列表返回严格 session schema；短提示词产生按 `seq` 递增的 `ask_human`，`afterSeq` cursor 只投影后续消息，回答后保留已回答的 question 与连续 follow-up trace；有内容的会话可更新分享/模式；未知 session 的 detail 与 message 写入均返回标准 `404 ErrorResponse`；删除后 detail 与 collection projection 都不再包含该 session。
- RT-05 的五个低耦合边界也已经由 dedicated handler smoke 执行：账户 handoffs 在认证/匿名下保持同一脱敏 projection schema；ledger 锁定 entries/jobs/totals 与 `limit` 不改变汇总；dev reset 锁定 active fixture reset 与 production `403` 不写入；folder delete 锁定确认名、认证/404 和 active 子项目投影；project detail 锁定 project/canvas/balance schema、认证、会话过期和 404。
- 这些仍只是 API-AUD-07 的可重复 route smoke 切片；尚未替代 92 个 operation 的 manifest 驱动 matrix，生成产物注册及其余 domain 仍需按 operation 补 success/error wire 断言。

### 本轮补齐项

本轮新增的账号、首页上下文和 Skill 作者 operation 也已纳入同一审计；此前 `POST /api/folders`、项目写操作、Presence 和 `POST /api/dev/reset` 使用了泛型成功体或
缺失 schema。现在契约明确为：

- 创建项目返回 `CreateProjectResponse { project, canvas }`；创建项目文件夹与重命名返回 `Folder`；
  删除文件夹返回 `{ deleted, deletedProjects }`，并强制 `confirmName` query；
- 更新/复制项目返回 `Project`；删除返回 `{ deleted, recycled: true }`，不删除画布；`GET /api/recycle-bin` 返回保留期限，恢复保留原画布，永久删除才走级联清理；复制没有 request body；
- Presence 的 `GET` 是 `text/event-stream`，不是 JSON polling；`POST` 接受严格 heartbeat，返回
  `{ ok: true, participant }`；
- scenario/reset 的成功体有可读本地样本；`reset` 的 schema 不再是悬空 `$ref`；
- `Creation Context` 用同一路径的 GET / PUT / POST 表示恢复、保存和发送前冻结，Skill 作者流用独立 `/api/skills/author` 路径表达草稿、审核、发布和下架；
- identity、preferences、notifications、account 与 ledger 保持独立读取/写入 operation，避免账户菜单把会话、偏好和账本折叠为一个无类型聚合。
- `GET /api/team` 与 `GET /api/shared-assets` 以 `ready|empty|permission-denied` 显式投影团队和共享素材；它们是只读、scenario 驱动的 local fixture，不读取真实成员或远端素材。
- `GET/POST /api/access-key` 只投影掩码 lifecycle；create/rotate/revoke 均要求 idempotency key，任何响应均没有 secret/reveal 字段。`POST /api/team/invites` 与 `PATCH /api/team/members/{memberId}` 只接收 local alias/role；owner 角色不可变更。`GET /api/account/handoffs` 显式标记订阅、发票和模型市场的未来 owner，不触发支付、开票或外部目录调用。
- `PATCH /api/folders/{folderId}` 同时承载项目文件夹重命名和封面更新；请求体是至少包含一个字段的 `UpdateFolderRequest`，不再错误复用只允许 `name` 的 `RenameRequest`。
- 上传边界单独记录在 [`ASSET_INGESTION.md`](ASSET_INGESTION.md)：`multipart/form-data` 的 `files[]`、50 MiB/文件、50 文件/请求、可选 `uploadToken` 取消票据、逐文件 `rejected` 与资产文件夹归属都必须由后端保留。

## 查询、空态、分页和 fixture 约定

| API | 查询 / body 约定 | 空态 | fixture / 错误 | 重试与替换边界 |
|---|---|---|---|---|
| `GET /api/projects` | 无参数 | `projects: []`, `folders: []`, `balance: 0` | `authenticated-empty` | future repository 保持排序和计数字段 |
| `POST /api/projects` | body 可省略；`name?`, `folderId?` | 不适用 | 默认创建“未命名项目 N”+“画布 1” | 后端应补 `folderId` 外键校验，但不改变 response |
| `POST /api/folders` | 无 body | 不适用 | 默认“未命名文件夹” | 后端生成 ID/时间，保留默认创建语义 |
| `DELETE /api/folders/{id}` | `confirmName` 必填且完全匹配 | 不适用 | `400` 不匹配，`404` 不存在 | 永久清理 active 子项目；已回收项目恢复时会回根目录 |
| `GET /api/recycle-bin` | 无参数 | `projects: []`, `purgedProjectIds: []` | 读取时清理超过 30 天的软删除项目 | background purge 可替代同步 sweep，但响应语义不变 |
| `POST/DELETE /api/recycle-bin/{id}` | POST 无 body；DELETE 由 UI 输入名称确认 | `404` 表示不在回收站 | restore 回原文件夹/根目录；永久删除级联画布和 Agent history | repository transaction + retention worker |
| `GET /api/assets` | `namespace`, `kind`, `q`, `tag` | `{ assets: [] }` | 已撤销 asset 不出现在列表 | storage/index 取代 fixture，不改筛选字段 |
| `GET /api/models` | `media`, `q` | 空 catalogue 是合法 200 | 无随机失败 fixture | provider registry 替换 catalogue |
| `GET /api/skills` | `category`, `collection`, `q`, `composer`, `fixture` | `fixture=empty` 返回空 `items/skills` | `fixture=error` 返回 `503` | catalogue 与 composer context 分离替换 |
| `GET /api/showcase` | `category`, `q`, `offset`, `limit`, `fixture` | `fixture=empty` 返回 `{ entries: [], page.total: 0 }` | `fixture=error` 返回 `503`；无精确命中以 `page.searchFallback=true` 返回当前分类推荐 | discovery service 需保留分页/回退语义 |
| `GET/POST /api/showcase/{snapshotId}/engagement` | GET 无 body；POST `{ action: like\|unlike\|share }` | GET 返回 viewer-local `{ liked: false, shareCount: 0 }` | GET 匿名可读；POST 匿名 `401`、非法 action `400`、未知或下架作品 `404`；重复 like 保持同一状态，share 每次递增 | engagement store 保留 viewer-local 写入，禁止修改冻结 snapshot/document/media |
| `POST /api/publish/{snapshotId}/clone` | 无 body；登录态必需 | 不适用 | `401` 表示匿名登录门，`404` 表示快照不可见 | transaction 创建独立 project/canvas 与 deep-cloned document |
| `GET /api/materials` | `kind`, `scope`, facets、`offset`, `limit`, `fixture` | `fixture=empty` 的 `page.total=0` | `fixture=error` 返回 `503`；`nextOffset=null` 终止分页 | catalogue 返回同一 page/facet 形状 |
| `GET /api/jobs` | `canvasId?` | `{ jobs: [] }` | scenario 固定进度/终态 | queue 恢复同一 job id / status 语义 |
| `GET /api/agent/sessions/{id}` | `afterSeq=0` | 没有新增消息时 `messages: []` | 无随机生成 | gateway 以 cursor 提供同一增量语义 |
| `GET /api/ledger` | `limit=1..200` | `entries: []` 和 totals/counts | scenario 驱动账本 | billing service 保留整数积分和排序 |
| `GET /api/team`, `GET /api/shared-assets` | 无请求参数 | `state=empty` 或 `assets: []` | anonymous 返回 `permission-denied`，登录空账户返回 `empty` | membership/ACL + asset index 保留 state 与 permission union |
| `GET/POST /api/access-key` | GET 无 body；POST `{ action, idempotencyKey }` | 不适用 | `not-created → active → revoked`、掩码唯一 | credential issuer + audit log 保留 generation/replay 语义 |
| `POST /api/team/invites`, `PATCH /api/team/members/{memberId}` | local alias/role + idempotency key | `409` 无团队或无空席；`403` owner 更新 | pending invite 与非 owner role 切换 | directory, ACL, invitation delivery + audit |
| `GET /api/account/handoffs` | 无请求参数 | `permission-denied` | subscription/invoice/model-market owner 与 empty/handoff state | billing, invoice, catalogue adapter |
| `GET /api/presence/{canvasId}` | subscriber query：`participantId`, `name`, `color`, `x/y/zoom?` | 首帧 `snapshot` 可含空 participants | `400` 形状错误；`429` 房间上限 | SSE 可改 WebSocket，但需 adapter 保留事件 union |
| `POST /api/dev/scenario`, `/reset` | scenarioId / 无 body | 不适用 | production 恒为 `403` | production 服务不得暴露这两个 route |

`fixture=empty|error` 只适用于 Skills composer context 和 Material catalogue；它们是显式、可复现的
UI 测试入口，其他 endpoint 不得暗藏随机空态或失败开关。所有列表的空集合必须是 `[]`，无下一页
使用 `nextOffset: null`，不得用 `null` 替代数组。

## 后端授权与错误交接

55 个 path、92 个 operation 均在 OpenAPI operation 级别标记 `x-authorization` 和 `security`：
15 个 public 读取与 7 个 `local-display-projection` 读取使用 `security: []`，其余 70 个
operation 使用 `bearerAuth`。后端以 [`AUTHORIZATION.md`](AUTHORIZATION.md) 的
public/local-display-projection/authenticated/owner/workspace 语义在业务查询和副作用前完成
认证/授权；本地 fixture 不验证 bearer，也不持久化真实凭证。

所有 OpenAPI 4xx/5xx JSON response 均已收敛到 `ErrorResponse`。当前 Route Handler 旧
`{ error: string }` 输出仅由 client compatibility layer 接受，不能带入后端 response contract；完整
迁移顺序和 `401`/`403`/`404` 行为见 [`ERRORS.md`](ERRORS.md) 与
[`AUTHORIZATION.md`](AUTHORIZATION.md)。

## Presence wire contract

Presence 是唯一非 JSON 业务 transport：

```text
GET /api/presence/CANVAS_ID?participantId=CLIENT_ID&name=NAME&color=%238b5cf6
    Content-Type: text/event-stream

POST /api/presence/CANVAS_ID
    { participantId, name, color, cursor, viewport }
    -> { ok: true, participant }
```

SSE 首帧为 `snapshot`，后续为 `join`、`move` 或 `leave`；每 20 秒有一个注释 keepalive。
协作者在 15 秒没有 heartbeat 后得到 `leave`（`reason: "expired"`）。这份状态是进程内、可丢失的
视图层数据，绝不写进 WorkflowDocument 或 workspace seed。多实例后端需要把本地 room map 替换为
共享 realtime bus，并在 adapter 中保留此事件联合和断线语义。

## 示例索引

| Operation | 可执行本地样本 |
|---|---|
| 创建项目 | [`project-create.response.json`](examples/project-create.response.json) |
| 创建/删除文件夹 | [`folder-create.response.json`](examples/folder-create.response.json), [`folder-delete.response.json`](examples/folder-delete.response.json) |
| Presence heartbeat | [`presence-heartbeat.request.json`](examples/presence-heartbeat.request.json), [`presence-heartbeat.response.json`](examples/presence-heartbeat.response.json) |
| Scenario / reset | [`scenario.response.json`](examples/scenario.response.json), [`reset.response.json`](examples/reset.response.json) |
| Materials 分页与收藏 | [`MATERIAL_CATALOG.md`](MATERIAL_CATALOG.md) |
| 项目回收站 | [`PROJECT_RECYCLE_BIN.md`](PROJECT_RECYCLE_BIN.md) |
| Jobs / Script V2 | [`jobs-create.request.json`](examples/jobs-create.request.json), [`script-v2-run.request.json`](examples/script-v2-run.request.json) |
| 团队邀请 / 成员角色 | [`team-invite.request.json`](examples/team-invite.request.json), [`team-invite.response.json`](examples/team-invite.response.json), [`team-member-update.request.json`](examples/team-member-update.request.json), [`team-member-update.response.json`](examples/team-member-update.response.json) |
| TV Show 互动 | [`showcase-engagement.initial.response.json`](examples/showcase-engagement.initial.response.json), [`showcase-engagement.request.json`](examples/showcase-engagement.request.json), [`showcase-engagement.like.response.json`](examples/showcase-engagement.like.response.json) |

## 后端接手验收

1. 根据 OpenAPI 的 `operationId` 实现相同 method/path/成功 schema/错误 status 与 operation-level
   `security`；不得让组件改到 provider URL 或读取环境变量。
2. 在 transport adapter 归一化真实 provider envelope 和错误为 `ErrorResponse`；页面只消费本仓的资源 schema。
3. 按 [`AUTHORIZATION.md`](AUTHORIZATION.md) 解析 public/local-display-projection/authenticated/owner/workspace，不把有效
   bearer 误当作 workspace editor 或 resource owner。
4. 保留空数组、分页终止、fixture 仅开发可用、revision 与 idempotency 的明确语义。
5. 让 SSE/实时层有独立部署和观测；不能把 cursor heartbeat 误当成画布 mutation。
6. 替换完成后保留并通过 `node scripts/verify-api-contract.mjs`、`pnpm vitest run src/contracts/__tests__/openapi.test.ts`、`pnpm typecheck` 和
   `pnpm lint`；新增 route 必须同时新增 manifest、OpenAPI、样本及 UI trigger。
