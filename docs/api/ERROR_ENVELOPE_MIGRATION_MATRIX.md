# Runtime Error-envelope Migration Matrix

> 审计范围：`src/server/http.ts`、全部 `src/app/api/**/route.ts`、`src/api/client.ts`、
> `docs/api/openapi.yaml`、`docs/api/ERRORS.md` 与现有测试。本文是只读审计记录：不改变
> runtime、OpenAPI 或页面行为。
>
> 审计时的 route 集合为 **55 paths / 92 operations**。其中 87 个 operation 使用
> `handle()`，5 个 operation 使用专门 transport（media 1、presence 2、preview 2）。
>
> **迁移状态（2026-09-05 后续修订）**：本矩阵下方的 Legacy 描述是审计时的迁移基线。
> `src/server/http.ts#handle` 现已把 87 个通用 JSON operation 的异常统一输出为完整
> `ErrorResponse`（`error.code`、`error.message`、可选 `details`、fixture-stable `requestId`）。
> 本文保留基线矩阵来锁定专门 transport 的剩余差异；media 和 SVG preview 仍不能被
> 视为已迁移的 JSON 路径；Presence 在握手前和 POST 的 JSON errors 已收敛，成功 GET 仍是 SSE。

## Envelope vocabulary

| 名称 | runtime / contract 形状 | 说明 |
| --- | --- | --- |
| **Pre-migration Legacy** | `{ "error": "message" }` | 兼容期输入形状；不再由通用 JSON handler 或 Presence route 产生。 |
| **Partial new** | `{ "error": { "code", "message", "details"? } }` | 兼容期输入形状；Presence domain errors 已迁移为完整 `ErrorResponse`。 |
| **OpenAPI target** | `{ "error": { "code", "message", "details"? }, "requestId": "..." }` | `ErrorResponse`。`ERRORS.md` 指定为未来后端、adapter 与消费者的唯一规范化非 2xx JSON 契约。 |
| **Non-JSON error** | 字节或文本 body | 媒体 route 当前实际如此；不应交给 JSON-only API client 解码。 |

`handle()` 对成功值和异常值均调用 `NextResponse.json`。成功与错误 content type 都是
`application/json`；异常现在生成稳定 `code` 和 fixture-stable `requestId`，保留显式
`HttpError.status`，其余异常仍按中文 message 的正则猜测为 400 或 500。Presence 在建立 SSE 前与 POST 时也复用该 JSON factory；media 和 SVG preview 仍有专门 transport 边界。

`createApiClient()` 会先读完整 response text 并强制 JSON parse。非 2xx 时它兼容 legacy
string 与 object-shaped `error`；object 分支读取 `code`、`message`、`details` 与可选 `requestId`，后者保存在 `ApiError.requestId`。没有匹配到 object code 时，客户端会按 HTTP status 推导 `ApiError.code`。
这保留了页面现有的 `ApiError.status`、`message`、`code`、`details` 使用方式；它并不适合
SSE、预览图或任意媒体字节响应。

## Route-family matrix

| Route family（完整 path 集合） | 实际成功 content type / 形状 | 实际错误 content type / 当前形状 | OpenAPI target | 迁移风险 | 不改变 UI 的验证需求 |
| --- | --- | --- | --- | --- | --- |
| **Agent**：`/api/agent/sessions`、`/api/agent/sessions/{sessionId}`、`/api/agent/sessions/{sessionId}/messages` | `application/json`；会话、消息、删除 projection | `application/json`；完整 ErrorResponse | 全部已声明 4xx/5xx 指向 `ErrorResponse` | 中。发送、人工回答、proposal resolve 的就近错误当前依赖文案；将 body 直接换形状会令未经过 client 的调用显示空错误。 | 对每个 400/404/500 经 transport 断言 `ApiError.status/message/code`；确认输入、已选 Skill、proposal/会话状态在失败后不被清空。 |
| **资产 JSON**：`/api/assets`、`/api/assets/{assetId}`、`/api/assets/folders`、`/api/assets/upload` | `application/json`；列表、资产/文件夹 projection、上传/取消结果；upload 请求为 `multipart/form-data` | `application/json`；完整 ErrorResponse（含 400/404/409/410/500） | 所有文档化 JSON error 指向 `ErrorResponse` | 高。上传存在取消 ticket、staging 与 409 冲突；错误 shape 切换若改变 status/message 会破坏上传进度、取消与重试语义。 | 覆盖 multipart 无文件、无效 token、文件夹不存在、ticket 冲突、删除资产；验证成功资产不回滚、失败文件仍可重试、`ApiError` 保留原有 status/message。 |
| **媒体字节**：`/api/media/{path}` | 文件扩展名决定 `image/svg+xml`、`image/png`、`image/jpeg`、`image/webp`、`video/mp4`、`video/webm`、`audio/wav`、`audio/mpeg`、`text/plain; charset=utf-8` 或 `application/octet-stream`；另有范围、缓存与安全 headers | `Response('Forbidden')` / `Response('Not found')`，即 `text/plain; charset=utf-8`，不是 JSON envelope | 200 为 `*/*`；403/404 当前文档为 `application/json` + `ErrorResponse` | **最高：当前 runtime 与 OpenAPI error content type 已漂移。** `<img>`、`<video>`、`<audio>` 以资源 URL 消费 body，不能假设 JSON；把 403/404 强行改 JSON 会改变浏览器资源失败表象、缓存及播放器 fallback。 | 用真实 HTTP 请求断言允许类型、403 traversal、404 缺失文件的 status、content type、CSP、nosniff、cache/range headers；在页面级确认媒体 `onerror`/质量降级不变。若要统一错误，先定义 binary-route 专用错误策略而非让 JSON client 读取它。 |
| **协作 Presence**：`/api/presence/{canvasId}` GET/POST | GET：`text/event-stream; charset=utf-8`；POST：`application/json` 的 heartbeat/lease result | 建流前 GET 与 POST 失败均为 `application/json` 完整 `ErrorResponse`；建流后的异常以连接关闭/重连处理 | GET 200 为 `text/event-stream`、POST 200 为 JSON；所有声明的 4xx/5xx 指向完整 `ErrorResponse` | 中。stream 创建前的 JSON error 与已建立 SSE 的 lifecycle 不同；必须保留 `EDIT_LEASE_CONFLICT` 等稳定 code，不能把 SSE 成功改成 JSON。 | 对无效 canvas/query、lease conflict、rate limit 分别检查 status、JSON content type、`ErrorResponse`/requestId；对成功 GET 检查首个 snapshot、keepalive、abort cleanup；对 POST 检查 heartbeat/acquire/renew/release 不改变编辑权与 follower 状态。 |
| **预览字节**：`/api/preview/character`、`/api/preview/stitch` | `image/svg+xml`；动态 SVG（角色参考、分镜拼接） | route 没有受控 error branch；渲染异常走框架默认错误行为，当前 OpenAPI 也只声明 200 | 仅声明 200 `image/svg+xml`，无 error target | 中。未来为 SVG 路径增加 JSON error 不能被 image consumer 当作图像；当前没有稳定的 status/content-type 承诺可迁移。 | 对正常参数、边界 rows/cols、非法 hue/label 请求断言仍为 SVG、缓存 header 和稳定画布尺寸；若新增错误 response，先锁定资源加载失败 UI 而不是假设 `ApiError` 会接管。 |
| **工作区与文件夹**：`/api/projects`、`/api/projects/{projectId}`、`/api/folders`、`/api/folders/{folderId}`、`/api/recycle-bin`、`/api/recycle-bin/{projectId}` | `application/json`；项目、文件夹、回收站与恢复/删除 result | `application/json`；完整 ErrorResponse（含登录过期 401、输入/不存在 400/404、意外 500） | 所有文档化 errors 指向 `ErrorResponse` | 高。现有 route tests 直接精确断言 `{ error: string }`，私有项目登录门也依赖 401 的用户文案。 | 覆盖新建/移动到缺失文件夹、session expired、重命名/删除、回收站恢复与永久删除；断言登录 returnTo、成功列表和用户输入都不会因 error normalization 改变。 |
| **画布、工作流与生成任务**：`/api/canvases`、`/api/canvases/{canvasId}`、`/api/jobs`、`/api/jobs/{jobId}`、`/api/compose`、`/api/compose/{taskId}` | `application/json`；canvas/document、mutation、job/compose task projection | `application/json`；完整 ErrorResponse（400/404/409/500；显式 `HttpError` 的 409 可到达） | 所有文档化 errors 指向 `ErrorResponse` | **最高 JSON family 风险。** revision conflict、任务终态、积分/报价/取消会驱动编辑器的保留输入、刷新和重试；当前 client 的 409 只按 status 归为 `REVISION_CONFLICT`。 | 以 adapter 注入新 envelope，验证 revision conflict 仍可刷新并仅重放一次，job/compose 失败不覆盖成功结果，取消/重试仍可恢复；保留 legacy fixture regression 至全部 UI 只消费 `ApiError`。 |
| **Creation Context 与 Script V2**：`/api/creation-context`、`/api/script-v2/quotes`、`/api/script-v2/runs`、`/api/script-v2/runs/{runId}` | `application/json`；creation draft/agent result、quote/run projection | `application/json`；完整 ErrorResponse（400/404/409/422/500） | 所有文档化 errors 指向 `ErrorResponse` | 高。报价过期、合规阻断、任务冲突分别需要不同 code；generic runtime 只保留文案/status，不能证明 target code 已在页面可用。 | 覆盖 malformed JSON、缺字段、过期 quote、422 合规与 409 transition；确认草稿、报价确认门、run 轮询与重试入口都保留，且 `details` 缺省不会造成 UI 崩溃。 |
| **发现、模型、素材与 Skills**：`/api/home`、`/api/models`、`/api/materials`、`/api/materials/{materialId}`、`/api/skills`、`/api/skills/{skillId}`、`/api/skills/author`、`/api/skills/author/{skillId}` | `application/json`；首页发现、catalog/detail、收藏、composer context、作者 Skill projection | `application/json`；完整 ErrorResponse（400/404/409/422/500/503） | 所有文档化 errors 指向 `ErrorResponse` | 中高。catalog fixture 503 会进入 stale-error/retry；收藏和 author publish 有幂等/校验文案。API tests 已直接断言 materials 与 skills 的 legacy 503 body。 | 针对 `fixture=error`、无效筛选、找不到 detail、收藏失败、author publish 422，验证旧数据仍显示、收藏原状态保留、retry 成功；经 adapter 比较 legacy/new 的 `ApiError` 可观察字段。 |
| **发布与 TV Show**：`/api/publish`、`/api/publish/{snapshotId}`、`/api/publish/{snapshotId}/clone`、`/api/showcase`、`/api/showcase/{snapshotId}`、`/api/showcase/{snapshotId}/playback`、`/api/showcase/{snapshotId}/engagement` | `application/json`；公开 snapshot、目录/detail/playback manifest、互动与 clone projection | `application/json`；完整 ErrorResponse（400/401/404/500/503） | 所有文档化 errors 指向 `ErrorResponse` | 高。匿名 clone/like 的 401 是登录门；目录 503 必须保留 stale content；public snapshot 只读边界不能被错误处理改为可编辑。 | 覆盖 anonymous 与登录后的 clone/engagement、missing snapshot、目录 fixture error、播放 manifest 缺失；验证点赞/分享/clone 失败不会修改冻结公开快照，重试只创建一次私有副本。 |
| **Account 与团队**：`/api/account`、`/api/account/handoffs`、`/api/access-key`、`/api/team`、`/api/team/invites`、`/api/team/members/{memberId}`、`/api/shared-assets`、`/api/identity`、`/api/preferences`、`/api/notifications`、`/api/ledger` | `application/json`；账户/身份、脱敏 key、handoff、团队、偏好、通知和积分 projection | `application/json`；完整 ErrorResponse（400/401/403/404/409/500） | 所有文档化 errors 指向 `ErrorResponse` | 高。Access Key 与团队 route 的权限、幂等与 404/409 需要稳定 machine code；必须保证 message、脱敏字段和登录 returnTo 不改变。 | 验证 key create/rotate/revoke 的 idempotency、invite/member role 的 401/403/404/409、身份 returnTo、通知/偏好和积分状态；断言 error body 不含 key/token，页面仍按 `ApiError.status/message/code` 显示既有 UI。 |
| **Development fixture control**：`/api/dev/reset`、`/api/dev/scenario` | `application/json`；reset/scenario projection | `application/json`；完整 ErrorResponse（403 production guard、400 unknown scenario、500） | 所有文档化 errors 指向 `ErrorResponse` | 低到中。测试当前精确断言 legacy 400/403；迁移会先影响 fixture reset 与 Playwright 前置，而不是产品 UI。 | 在 `NODE_ENV=production` 验证 GET/POST 403；验证未知 scenario 400；迁移时更新测试辅助器但保留 scenario reset 的确定性和 error status。 |

## Cross-family migration gates

1. **先 adapter，后 route。** `ERRORS.md` 已规定后端/adapter 先归一化上游错误。用 adapter
   同时喂给 `createApiClient()` legacy 与完整 target body，比较得到的 `ApiError.status`、`message`、
   `code`、`details`；在此阶段不让页面组件解析 `response.error`。
2. **JSON runtime 已完成第一阶段收敛。** 87 个 `handle()` operation 与 Presence 的握手前/POST errors 已输出完整 target；`ApiError.requestId` 保留可诊断关联值。兼容输入仍应只存在于 adapter/消费者，新增 operation 不得输出 legacy body。
3. **按 transport 分开验收。** `application/json`、`text/event-stream`、媒体字节与 SVG 不是可互换
   的 error channel。media 的 OpenAPI 403/404 漂移、SSE 已建流后的生命周期、preview 缺少
   error declaration 应分别解决，不能用“所有错误都是 JSON”掩盖。
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
- `src/api/__tests__/client.test.ts` 已覆盖 legacy 409、完整 `ErrorResponse` 的 details/requestId round-trip、invalid JSON、typed 2xx data 与本地 path boundary。
- projects、jobs、models、materials、skills、development、publish clone 等 route tests 已断言完整 `ErrorResponse`；legacy 仅作为 client compatibility input。
- Presence GET/POST error-envelope 已有 route-level contract test；media 403/404 content type/headers 仍是优先补齐的 transport-aware runtime 验证缺口。
