# Runtime Error-envelope Migration Matrix

> 审计范围：`src/server/http.ts`、全部 `src/app/api/**/route.ts`、`src/api/client.ts`、
> `docs/api/openapi.yaml`、`docs/api/ERRORS.md` 与现有测试。本文是只读审计记录：不改变
> runtime、OpenAPI 或页面行为。
>
> 审计时的 route 集合为 **55 paths / 92 operations**。其中 87 个 operation 使用
> `handle()`，5 个 operation 使用专门 transport（media 1、presence 2、preview 2）。

## Envelope vocabulary

| 名称 | runtime / contract 形状 | 说明 |
| --- | --- | --- |
| **Legacy** | `{ "error": "message" }` | `handle()` 的全部异常分支，以及 presence 的 `HttpError` / 未分类异常实际返回的 JSON 形状。 |
| **Partial new** | `{ "error": { "code", "message", "details"? } }` | 仅 presence 的 `PresenceError` 分支会产生；它没有 `requestId`，因此还不是 OpenAPI 的完整目标。 |
| **OpenAPI target** | `{ "error": { "code", "message", "details"? }, "requestId": "..." }` | `ErrorResponse`。`ERRORS.md` 指定为未来后端、adapter 与消费者的唯一规范化非 2xx JSON 契约。 |
| **Non-JSON error** | 字节或文本 body | 媒体 route 当前实际如此；不应交给 JSON-only API client 解码。 |

`handle()` 对成功值和异常值均调用 `NextResponse.json`。因而其成功与错误 content type
都是 `application/json`；它不会生成 `requestId`、稳定 `code` 或 `details`。它保留显式
`HttpError.status`，其余异常按中文 message 的正则猜测为 400 或 500。

`createApiClient()` 会先读完整 response text 并强制 JSON parse。非 2xx 时它兼容 legacy
string 与 object-shaped `error`；object 分支读取 `code`、`message`、`details`，但不读取或
校验 `requestId`。没有匹配到 object code 时，客户端会按 HTTP status 推导 `ApiError.code`。
这保留了页面现有的 `ApiError.status`、`message`、`code`、`details` 使用方式；它并不适合
SSE、预览图或任意媒体字节响应。

## Route-family matrix

| Route family（完整 path 集合） | 实际成功 content type / 形状 | 实际错误 content type / 当前形状 | OpenAPI target | 迁移风险 | 不改变 UI 的验证需求 |
| --- | --- | --- | --- | --- | --- |
| **Agent**：`/api/agent/sessions`、`/api/agent/sessions/{sessionId}`、`/api/agent/sessions/{sessionId}/messages` | `application/json`；会话、消息、删除 projection | `application/json`；Legacy | 全部已声明 4xx/5xx 指向 `ErrorResponse` | 中。发送、人工回答、proposal resolve 的就近错误当前依赖文案；将 body 直接换形状会令未经过 client 的调用显示空错误。 | 对每个 400/404/500 经 transport 断言 `ApiError.status/message/code`；确认输入、已选 Skill、proposal/会话状态在失败后不被清空。 |
| **资产 JSON**：`/api/assets`、`/api/assets/{assetId}`、`/api/assets/folders`、`/api/assets/upload` | `application/json`；列表、资产/文件夹 projection、上传/取消结果；upload 请求为 `multipart/form-data` | `application/json`；Legacy（含 400/404/409/410/500） | 所有文档化 JSON error 指向 `ErrorResponse` | 高。上传存在取消 ticket、staging 与 409 冲突；错误 shape 切换若改变 status/message 会破坏上传进度、取消与重试语义。 | 覆盖 multipart 无文件、无效 token、文件夹不存在、ticket 冲突、删除资产；验证成功资产不回滚、失败文件仍可重试、`ApiError` 保留原有 status/message。 |
| **媒体字节**：`/api/media/{path}` | 文件扩展名决定 `image/svg+xml`、`image/png`、`image/jpeg`、`image/webp`、`video/mp4`、`video/webm`、`audio/wav`、`audio/mpeg`、`text/plain; charset=utf-8` 或 `application/octet-stream`；另有范围、缓存与安全 headers | `Response('Forbidden')` / `Response('Not found')`，即 `text/plain; charset=utf-8`，不是 JSON envelope | 200 为 `*/*`；403/404 当前文档为 `application/json` + `ErrorResponse` | **最高：当前 runtime 与 OpenAPI error content type 已漂移。** `<img>`、`<video>`、`<audio>` 以资源 URL 消费 body，不能假设 JSON；把 403/404 强行改 JSON 会改变浏览器资源失败表象、缓存及播放器 fallback。 | 用真实 HTTP 请求断言允许类型、403 traversal、404 缺失文件的 status、content type、CSP、nosniff、cache/range headers；在页面级确认媒体 `onerror`/质量降级不变。若要统一错误，先定义 binary-route 专用错误策略而非让 JSON client 读取它。 |
| **协作 Presence**：`/api/presence/{canvasId}` GET/POST | GET：`text/event-stream; charset=utf-8`；POST：`application/json` 的 heartbeat/lease result | GET 与 POST 的失败都是 `application/json`：`HttpError`/未知错误为 Legacy；`PresenceError` 为 Partial new（有 `code/details`，无 `requestId`） | GET 200 为 `text/event-stream`、POST 200 为 JSON；所有声明的 4xx/5xx 指向完整 `ErrorResponse` | 高。stream 创建前的 JSON error 与已建立 SSE 的 lifecycle 不同；`PresenceError` 迁移时补 requestId 不能丢 `EDIT_LEASE_CONFLICT` 等稳定 code，也不能把 SSE 成功改成 JSON。 | 对无效 canvas/query、lease conflict、rate limit 分别检查 status、JSON content type 与 legacy/partial-new 兼容；对成功 GET 检查首个 snapshot、keepalive、abort cleanup；对 POST 检查 heartbeat/acquire/renew/release 不改变编辑权与 follower 状态。 |
| **预览字节**：`/api/preview/character`、`/api/preview/stitch` | `image/svg+xml`；动态 SVG（角色参考、分镜拼接） | route 没有受控 error branch；渲染异常走框架默认错误行为，当前 OpenAPI 也只声明 200 | 仅声明 200 `image/svg+xml`，无 error target | 中。未来为 SVG 路径增加 JSON error 不能被 image consumer 当作图像；当前没有稳定的 status/content-type 承诺可迁移。 | 对正常参数、边界 rows/cols、非法 hue/label 请求断言仍为 SVG、缓存 header 和稳定画布尺寸；若新增错误 response，先锁定资源加载失败 UI 而不是假设 `ApiError` 会接管。 |
| **工作区与文件夹**：`/api/projects`、`/api/projects/{projectId}`、`/api/folders`、`/api/folders/{folderId}`、`/api/recycle-bin`、`/api/recycle-bin/{projectId}` | `application/json`；项目、文件夹、回收站与恢复/删除 result | `application/json`；Legacy（含登录过期 401、输入/不存在 400/404、意外 500） | 所有文档化 errors 指向 `ErrorResponse` | 高。现有 route tests 直接精确断言 `{ error: string }`，私有项目登录门也依赖 401 的用户文案。 | 覆盖新建/移动到缺失文件夹、session expired、重命名/删除、回收站恢复与永久删除；断言登录 returnTo、成功列表和用户输入都不会因 error normalization 改变。 |
| **画布、工作流与生成任务**：`/api/canvases`、`/api/canvases/{canvasId}`、`/api/jobs`、`/api/jobs/{jobId}`、`/api/compose`、`/api/compose/{taskId}` | `application/json`；canvas/document、mutation、job/compose task projection | `application/json`；Legacy（400/404/409/500；显式 `HttpError` 的 409 可到达） | 所有文档化 errors 指向 `ErrorResponse` | **最高 JSON family 风险。** revision conflict、任务终态、积分/报价/取消会驱动编辑器的保留输入、刷新和重试；当前 client 的 409 只按 status 归为 `REVISION_CONFLICT`。 | 以 adapter 注入新 envelope，验证 revision conflict 仍可刷新并仅重放一次，job/compose 失败不覆盖成功结果，取消/重试仍可恢复；保留 legacy fixture regression 至全部 UI 只消费 `ApiError`。 |
| **Creation Context 与 Script V2**：`/api/creation-context`、`/api/script-v2/quotes`、`/api/script-v2/runs`、`/api/script-v2/runs/{runId}` | `application/json`；creation draft/agent result、quote/run projection | `application/json`；Legacy（400/404/409/422/500） | 所有文档化 errors 指向 `ErrorResponse` | 高。报价过期、合规阻断、任务冲突分别需要不同 code；generic runtime 只保留文案/status，不能证明 target code 已在页面可用。 | 覆盖 malformed JSON、缺字段、过期 quote、422 合规与 409 transition；确认草稿、报价确认门、run 轮询与重试入口都保留，且 `details` 缺省不会造成 UI 崩溃。 |
| **发现、模型、素材与 Skills**：`/api/home`、`/api/models`、`/api/materials`、`/api/materials/{materialId}`、`/api/skills`、`/api/skills/{skillId}`、`/api/skills/author`、`/api/skills/author/{skillId}` | `application/json`；首页发现、catalog/detail、收藏、composer context、作者 Skill projection | `application/json`；Legacy（400/404/409/422/500/503） | 所有文档化 errors 指向 `ErrorResponse` | 中高。catalog fixture 503 会进入 stale-error/retry；收藏和 author publish 有幂等/校验文案。API tests 已直接断言 materials 与 skills 的 legacy 503 body。 | 针对 `fixture=error`、无效筛选、找不到 detail、收藏失败、author publish 422，验证旧数据仍显示、收藏原状态保留、retry 成功；经 adapter 比较 legacy/new 的 `ApiError` 可观察字段。 |
| **发布与 TV Show**：`/api/publish`、`/api/publish/{snapshotId}`、`/api/publish/{snapshotId}/clone`、`/api/showcase`、`/api/showcase/{snapshotId}`、`/api/showcase/{snapshotId}/playback`、`/api/showcase/{snapshotId}/engagement` | `application/json`；公开 snapshot、目录/detail/playback manifest、互动与 clone projection | `application/json`；Legacy（400/401/404/500/503） | 所有文档化 errors 指向 `ErrorResponse` | 高。匿名 clone/like 的 401 是登录门；目录 503 必须保留 stale content；public snapshot 只读边界不能被错误处理改为可编辑。 | 覆盖 anonymous 与登录后的 clone/engagement、missing snapshot、目录 fixture error、播放 manifest 缺失；验证点赞/分享/clone 失败不会修改冻结公开快照，重试只创建一次私有副本。 |
| **Account 与团队**：`/api/account`、`/api/account/handoffs`、`/api/access-key`、`/api/team`、`/api/team/invites`、`/api/team/members/{memberId}`、`/api/shared-assets`、`/api/identity`、`/api/preferences`、`/api/notifications`、`/api/ledger` | `application/json`；账户/身份、脱敏 key、handoff、团队、偏好、通知和积分 projection | `application/json`；Legacy（400/401/403/404/409/500） | 所有文档化 errors 指向 `ErrorResponse` | 高。Access Key 与团队 route 的权限、幂等与 404/409 需要稳定 machine code；必须保证 message、脱敏字段和登录 returnTo 不改变。 | 验证 key create/rotate/revoke 的 idempotency、invite/member role 的 401/403/404/409、身份 returnTo、通知/偏好和积分状态；断言 error body 不含 key/token，页面仍按 `ApiError.status/message/code` 显示既有 UI。 |
| **Development fixture control**：`/api/dev/reset`、`/api/dev/scenario` | `application/json`；reset/scenario projection | `application/json`；Legacy（403 production guard、400 unknown scenario、500） | 所有文档化 errors 指向 `ErrorResponse` | 低到中。测试当前精确断言 legacy 400/403；迁移会先影响 fixture reset 与 Playwright 前置，而不是产品 UI。 | 在 `NODE_ENV=production` 验证 GET/POST 403；验证未知 scenario 400；迁移时更新测试辅助器但保留 scenario reset 的确定性和 error status。 |

## Cross-family migration gates

1. **先 adapter，后 route。** `ERRORS.md` 已规定后端/adapter 先归一化上游错误。用 adapter
   同时喂给 `createApiClient()` legacy 与完整 target body，比较得到的 `ApiError.status`、`message`、
   `code`、`details`；在此阶段不让页面组件解析 `response.error`。
2. **JSON runtime 需要一个兼容窗口。** 87 个 `handle()` operation 仍会产生 Legacy。完整 target
   带来的 `requestId` 必须通过 transport/日志保存，而不是要求现有页面读取它；移除 legacy 前，逐项
   替换 route-level exact-body 测试和所有直连 fetch consumer。
3. **按 transport 分开验收。** `application/json`、`text/event-stream`、媒体字节与 SVG 不是可互换
   的 error channel。media 的 OpenAPI 403/404 漂移、presence 的 Partial new shape、preview 缺少
   error declaration应分别解决，不能用“所有错误都是 JSON”掩盖。
4. **不要让 status 推导掩盖 domain code。** `createApiClient()` 当前把所有 409 默认映射为
   `REVISION_CONFLICT`。后端交接前需要至少验证 `EDIT_LEASE_CONFLICT`、`SESSION_EXPIRED`、
   `ALREADY_TERMINAL`、`QUOTE_EXPIRED`、`INSUFFICIENT_CREDITS` 与 `COMPLIANCE_BLOCKED` 都以 target
   `error.code` 到达，且页面的重试/阻断路径不变。
5. **把 content type 纳入契约测试。** 现有 OpenAPI 测试验证 200 transport 类型，并验证所有文档化
   4xx/5xx 引用 `ErrorResponse`；它没有对 runtime handler 的 error content type/body 执行跨 route
   对照。迁移前应新增只读 HTTP contract suite，特别覆盖 media、presence 和 representative
   `handle()` routes。

## Existing evidence and explicit gaps

- `src/contracts/__tests__/openapi.test.ts` 已验证每个文档化 4xx/5xx 是
  `application/json` + `ErrorResponse`，并验证 success transport 为 JSON、SSE 或 binary；这是
  **文档目标**，不是 runtime envelope 已完成的证据。
- `src/api/__tests__/client.test.ts` 已覆盖 legacy 409、invalid JSON、typed 2xx data 与本地 path
  boundary；没有覆盖完整 `ErrorResponse` 的 `requestId` 或 `details` round-trip。
- projects、jobs、models、materials、skills、development、publish clone 等 route tests 直接断言
  Legacy body；这些是兼容窗口必须保留或有计划替换的测试证据。
- 没有发现 media 403/404 content type 的 route test，也没有发现 presence GET/POST error-envelope
  的 route test；二者是当前最需要补足的迁移前验证缺口。

