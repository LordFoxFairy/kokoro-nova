# Route 覆盖审计与后端替换边界

> Contract version: `1.17.0-skill-author-form` · scope: 46 paths / 80 operations

此文档是 `route-manifest.ts`、`openapi.yaml` 与现有 Next.js Route Handler 的人工审计结果。
它只描述当前前端子仓库的确定性 mock 边界：不传递真实 LibTV URL、Cookie、token 或任何上游
凭证。每个 operation 都已经列入 route manifest，并由
`src/contracts/__tests__/openapi.test.ts` 校验 method/path、`operationId`、UI trigger、场景和 wire
transport 的一一对应。

## 覆盖结论

| 范围 | path / operation | OpenAPI schema | 确定性 mock 约定 | 后端接手边界 |
|---|---:|---|---|---|
| Project / Folder / Recycle Bin | 6 / 12 | 已精确 | 空账户、默认命名、软删除 30 天保留、恢复与永久删除确认 | project/folder repository |
| Canvas / workflow / Creation Context | 3 / 8 | 已精确 | revision、冲突、当前 document 与首页发送前上下文冻结 | document store + optimistic lock + context store |
| Jobs / Script V2 / compose | 6 / 9 | 已精确 | quote、poll、幂等、终态与 fixture | queue/provider/render adapter |
| Asset / media / preview | 7 / 11 | 已精确 | local fixture media、upload 暂存、soft delete | object storage + asset index |
| Catalogue | 7 / 12 | 已精确 | models、materials、市场/作者 Skill 的本地 catalogue | registry/catalogue service |
| Agent | 3 / 7 | 已精确 | 按 `afterSeq` 增量读取、固定版本 Skill、确认门与本地 fallback trace | agent gateway |
| Public discovery / publish | 6 / 8 | 已精确 | 首页、showcase、分页发现与冻结 public snapshot 私有复制 | discovery/publish service |
| Account / ledger | 5 / 8 | 已精确 | identity、会话、钱包、偏好、通知与积分投影 | shared account domain + billing/ledger service |
| Presence | 1 / 2 | 已补强 | SSE、heartbeat、TTL、连接上限 | shared realtime bus |
| Development fixtures | 2 / 3 | 已补强 | dev-only scenario/reset | 不部署到 production |

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
| `POST /api/publish/{snapshotId}/clone` | 无 body；登录态必需 | 不适用 | `401` 表示匿名登录门，`404` 表示快照不可见 | transaction 创建独立 project/canvas 与 deep-cloned document |
| `GET /api/materials` | `kind`, `scope`, facets、`offset`, `limit`, `fixture` | `fixture=empty` 的 `page.total=0` | `fixture=error` 返回 `503`；`nextOffset=null` 终止分页 | catalogue 返回同一 page/facet 形状 |
| `GET /api/jobs` | `canvasId?` | `{ jobs: [] }` | scenario 固定进度/终态 | queue 恢复同一 job id / status 语义 |
| `GET /api/agent/sessions/{id}` | `afterSeq=0` | 没有新增消息时 `messages: []` | 无随机生成 | gateway 以 cursor 提供同一增量语义 |
| `GET /api/ledger` | `limit=1..200` | `entries: []` 和 totals/counts | scenario 驱动账本 | billing service 保留整数积分和排序 |
| `GET /api/presence/{canvasId}` | subscriber query：`participantId`, `name`, `color`, `x/y/zoom?` | 首帧 `snapshot` 可含空 participants | `400` 形状错误；`429` 房间上限 | SSE 可改 WebSocket，但需 adapter 保留事件 union |
| `POST /api/dev/scenario`, `/reset` | scenarioId / 无 body | 不适用 | production 恒为 `403` | production 服务不得暴露这两个 route |

`fixture=empty|error` 只适用于 Skills composer context 和 Material catalogue；它们是显式、可复现的
UI 测试入口，其他 endpoint 不得暗藏随机空态或失败开关。所有列表的空集合必须是 `[]`，无下一页
使用 `nextOffset: null`，不得用 `null` 替代数组。

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

## 后端接手验收

1. 根据 OpenAPI 的 `operationId` 实现相同 method/path/成功 schema/错误 status；不得让组件改到
   provider URL 或读取环境变量。
2. 先在 transport adapter 归一化真实 provider envelope；页面只消费本仓的资源 schema。
3. 保留空数组、分页终止、fixture 仅开发可用、revision 与 idempotency 的明确语义。
4. 让 SSE/实时层有独立部署和观测；不能把 cursor heartbeat 误当成画布 mutation。
5. 替换完成后保留并通过 `node scripts/verify-api-contract.mjs`、`pnpm vitest run src/contracts/__tests__/openapi.test.ts`、`pnpm typecheck` 和
   `pnpm lint`；新增 route 必须同时新增 manifest、OpenAPI、样本及 UI trigger。
