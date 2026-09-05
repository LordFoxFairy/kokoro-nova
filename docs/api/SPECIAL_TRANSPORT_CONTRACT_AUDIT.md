# Special Transport Contract Audit

- 审计日期：2026-09-05
- 审计范围：`docs/CODEBASE_MAP.md`、`docs/api/openapi.yaml`、`docs/api/ERRORS.md`、`src/app/api/**`，以及直接消费者 `src/lib/presence-client.ts`、`src/components/**`。
- 审计口径：本文描述的是当前本地 mock 的**实际 wire 行为**，并把它与 OpenAPI `1.25.1-account-member-not-found` 的声明分开。没有修改 route、既有文档或 OpenAPI。

## 结论

通用 JSON handler 已稳定输出完整 `ErrorResponse`，特殊 transport 的成功/异常语义仍需按资源类型消费：

1. Presence 在**握手前**和 POST 失败时返回完整 JSON `ErrorResponse`；成功 GET 仍是 SSE，已建流后的异常仍以连接关闭/重连处理。
2. media 是浏览器资源 URL；403/404 返回并在 OpenAPI 声明为 `text/plain; charset=utf-8` 的 `Forbidden` / `Not found`。
3. 两个 SVG preview 只声明成功字节流；代码没有受控 error branch，因此框架级失败没有稳定的 status、content type、envelope 或 `requestId` 契约。

这些端点不应被 `src/api/client.ts` 的 JSON-only transport 当作同一类请求。特别是，已建立的 SSE 和 `<img>/<video>/<audio>` 资源加载不具备把 JSON body 转为页面级 `ApiError` 的位置。

## 统一目标与当前实现

`docs/api/ERRORS.md` 的目标错误体是：

```json
{
  "error": {
    "code": "STABLE_CODE",
    "message": "面向用户的安全文案",
    "details": {}
  },
  "requestId": "req_local_..."
}
```

`src/server/http.ts` 的通用 `handle()` 确实生成该形状及 fixture-stable `requestId`。以下 special routes 没有进入该 handler：

| Route / method | 成功 transport | 当前错误 transport | 完整 `ErrorResponse` / `requestId` |
| --- | --- | --- | --- |
| `GET /api/presence/{canvasId}` | SSE | 握手前 JSON；已建流内无 JSON error channel | 是（仅握手前） |
| `POST /api/presence/{canvasId}` | JSON | JSON | 是 |
| `GET /api/media/{path}` | binary | plain text | 否 |
| `GET /api/preview/character` | `image/svg+xml` | 无受控 branch | 未承诺 |
| `GET /api/preview/stitch` | `image/svg+xml` | 无受控 branch | 未承诺 |

## Presence：SSE 与 JSON mutation 的双 transport

### `GET /api/presence/{canvasId}` — SSE subscription

| 项 | 当前实现 |
| --- | --- |
| 成功 status / content type | `200`，`text/event-stream; charset=utf-8`。额外头为 `Cache-Control: no-cache, no-store, no-transform`、`Connection: keep-alive`、`X-Accel-Buffering: no`。 |
| 首帧与事件 | 先写 `: connected {canvasId}` 注释，再写 `event: snapshot` + `data: {"type":"snapshot","participants":[...]}`；后续为 `join` / `move` / `leave` JSON data 帧。每 20 秒写 `: keepalive` 注释。 |
| 建连前的输入错误 | `canvasId`、`participantId`、`name`、`color`、视口参数不合法时，`HttpError` 由共享 `errorResponseFor()` 返回 `400 application/json` 的完整 `ErrorResponse`，含 `INVALID_INPUT` 与 fixture-stable `requestId`。 |
| 建连前的容量错误 | `subscribe()` 的 listener 上限会抛 `PresenceError(429, ...)`，但它发生在 `ReadableStream.start()` 内，HTTP `200` 已被构造；当前 route 不存在可依赖的握手期 `429 ErrorResponse` wire body。客户端应将该 stream error 视为连接失败并重连。后续若要声明 `429`，须在构造 `Response` 前完成容量预检并同步修改 runtime、OpenAPI 与测试。 |
| SSE 初始化/连接期异常 | route 没有定义 `event: error`、`retry:` 或带 `requestId` 的 SSE error event。流一旦作为 `200 text/event-stream` 建立，不能再改写为 HTTP JSON error；stream start / 写入失败的可观察结果是连接关闭或客户端重连，而不是受控 `500 ErrorResponse`。 |
| OpenAPI 声明 | `200 text/event-stream` 正确标注了 `PresenceStreamEvent`、20 秒 keepalive，并挂接 file-backed `PresenceSnapshotSseFrameExample`：fixture 是 JSON 编码的 SSE 字符串，含 `: connected` 注释和第一个 `event: snapshot` / `data:` 帧，保持 `string/binary` response schema 与真实 wire framing 一致；但列出的 400/429/500 都声明 `application/json` 的完整 `ErrorResponse`，与当前 runtime body 不符。 |

### `POST /api/presence/{canvasId}` — heartbeat / editor lease

| 项 | 当前实现 |
| --- | --- |
| 成功 status / content type | `200 application/json`。heartbeat 为 `{ ok: true, participant }`；lease acquire/heartbeat/release 为 `{ ok: true, action, lease }`。 |
| `HttpError` / 未分类错误 | `400` 或 `500 application/json` 完整 `ErrorResponse`，分别带 status-derived stable code（例如 `INVALID_INPUT` / `INTERNAL_ERROR`）和 requestId。 |
| 容量 domain error | participant/connection 上限经 `PresenceError(429, ...)`；返回 `RATE_LIMITED`、可选 details 与 requestId。 |
| 编辑席位冲突 | `409 application/json` 完整 `ErrorResponse`：`{ "error": { "code": "EDIT_LEASE_CONFLICT", "message": "...", "details": { "canvasId", "ownerClientId", "expiresAt" } }, "requestId": "req_local_..." }`。保留可消费的 domain code/details。 |
| 失效或旧租约 | `409 application/json` 完整 `ErrorResponse`：`{ "error": { "code": "SESSION_EXPIRED", "message": "...", "details": { "canvasId" } }, "requestId": "req_local_..." }`。 |
| OpenAPI 声明 | 成功 `PresenceUpdateResponse` 与 request union 已对齐；400/409/429/500 的 JSON 错误现与完整 `ErrorResponse` 对齐。 |

### Presence 客户端消费边界

- `src/lib/presence-client.ts` 用 `fetch(..., Accept: text/event-stream)` 和手写 frame parser 读取 GET，不使用 `EventSource`。当握手 status 非 2xx 时，它会解析完整 JSON `ErrorResponse` 并保留为 `ApiError(status, code, details, requestId)`；无 envelope 或成功响应却缺少 `body` 时仍使用紧凑的 `Error("presence stream {status}")` fallback。随后以指数退避重连。
- Presence POST 通过 typed `client.presence.*` 进入 `src/api/client.ts`。该 client 可兼容 legacy string 与 object-shaped error，并让 `EDIT_LEASE_CONFLICT` / `SESSION_EXPIRED` 到达 `ApiError.code`；`ApiError` 现保留 `requestId`，因此 JSON transport 的调用方可将其用于安全诊断；页面仍只应展示安全 message，不显示内部细节。
- 获取 lease 的 UI 仅以 `EDIT_LEASE_CONFLICT` 进入 blocked 状态；其他错误回到 idle。续约错误则显示为 blocked。任何 envelope 收敛都必须保持这两个 409 code，而不是仅按 status 归为 `REVISION_CONFLICT`。

## Media：浏览器资源字节流

### `GET /api/media/{path}`

| 项 | 当前实现 |
| --- | --- |
| 成功 status | `200`。 |
| 成功 content type | 按扩展名：`image/svg+xml`、`image/png`、`image/jpeg`、`image/webp`、`video/mp4`、`video/webm`、`audio/wav`、`audio/mpeg`、`text/plain; charset=utf-8`；未知扩展名为 `application/octet-stream`。 |
| 成功 headers | `Content-Length`、`Cache-Control: public, max-age=31536000, immutable`、`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`、`X-Content-Type-Options: nosniff`。实现当前直接整文件读取并返回 `200`，不声明 `Accept-Ranges`、不解析 `Range` request，也不实现 `206` / `Content-Range`。 |
| 路径/符号链接越界 | `403 text/plain; charset=utf-8`，body 为 `Forbidden`。无 JSON envelope、code、details、requestId。 |
| 找不到或读取失败 | `404 text/plain; charset=utf-8`，body 为 `Not found`。catch 覆盖所有读取/realpath 失败，故当前不区分“文件缺失”与其他 I/O 失败。无 JSON envelope、code、details、requestId。 |
| OpenAPI 声明 | `200 */*` binary 与实际成功类别兼容；403/404 已声明 `text/plain; charset=utf-8` string 与 `Forbidden` / `Not found` examples。成功 response 枚举 Content-Length、Cache-Control、CSP 与 nosniff headers，并明确当前不声明/实现 Range/206；扩展名映射仍为实现级说明。 |

### Media 客户端消费边界

- 这些地址由 artifact、`<img>`、`<video>`、`<audio>`、native player 和 showcase playback 直接消费；`ClipEditor` 还明确只允许有时长的本地 `/api/media/` source。它们不是 `createApiClient()` 的 JSON request。
- 元素加载失败通常通过媒体/图片的 `error` event 或播放器 fallback 表现给 UI；元素不会将 `Forbidden` / `Not found` 文本转成 `ApiError`。把 body 改成 JSON 并不能令 typed client 获得 code，反而会改变浏览器资源加载和降级表象。
- 现有 `src/server/__tests__/media-route-traversal.test.ts` 已验证 realpath containment、403/404 status 和不泄露路径外内容；尚未锁定 error content type/body、success security/cache headers、扩展名映射或任何 Range 行为。

## SVG preview：动态二进制资源

### `GET /api/preview/character`

| 项 | 当前实现 |
| --- | --- |
| 成功 | `200 image/svg+xml`，`Cache-Control: public, max-age=86400`。`hue` 缺省为 210；非有限值回退 210。`label` 进入 deterministic SVG seed 和转义/截断后的 caption。 |
| 错误 | route 没有显式参数拒绝或 try/catch。渲染异常只会走框架默认 failure 行为；不存在稳定 status、content type、error body 或 requestId 承诺。 |
| OpenAPI | 仅声明 200 `image/svg+xml`，与“当前无受控 error contract”一致；`hue` / `label` 的默认值已声明。成功 SVG content 以 `x-example-policy.mode: explicit-exemption` 明确记录：不提交渲染字节 fixture，也不伪造 JSON failure payload；实际成功字节由 `preview-route.test.ts` 验证。 |

### `GET /api/preview/stitch`

| 项 | 当前实现 |
| --- | --- |
| 成功 | `200 image/svg+xml`，`Cache-Control: public, max-age=86400`；输出固定为 2048×1152。 |
| 参数归一化 | `rows` / `cols` 对缺省、非有限和越界数值归一化到 1..5；`seq` 只有精确值 `1` 显示序号，其他任意值按无序号处理。 |
| 错误 | 无显式 error branch；同样没有稳定 failure envelope 或 requestId。 |
| OpenAPI | 只声明 200；description 已说明 rows/cols 归一化。`seq` 是默认 `"0"` 的 string，只有精确值 `"1"` 启用序号，其余任意值按无序号处理；这与 runtime 的宽容归一化一致。成功 SVG content 同样使用 `x-example-policy.mode: explicit-exemption`：不提交渲染字节 fixture，也不伪造 JSON failure payload；实际成功字节由 `preview-route.test.ts` 验证。 |

### Preview 客户端消费边界

- `CanvasWorkspace` 将 character/stitch URL 直接写入 artifact 的 `url` / `thumbnailUrl`；后续由图像资源消费者加载。没有 preview-specific JSON client、错误 parser 或 requestId 展示位点。
- 因而若未来必须提供可操作 failure，应先定义调用方在图片 `onerror` 时的占位/重试体验；不要假设向 image URL 返回 JSON 会自动进入 `ApiError`。

## OpenAPI 改进建议

按风险和不改变既有页面语义的优先级：

1. **已关闭：Presence 握手 requestId 的客户端保留。** route 已让握手前 GET 与 POST 的受控 JSON errors 使用完整 `ErrorResponse`，并保留 `EDIT_LEASE_CONFLICT`、`SESSION_EXPIRED` 和 details；SSE handshake client 现解析该 envelope 并以 `ApiError` 保留 `requestId`。对已建立 SSE，不把 JSON response 写进流内；连接期异常仍以连接关闭/重连处理，只有新增版本化的 `event: error` schema 后才由客户端实现该事件。
2. **已关闭：media 403/404 OpenAPI content type。** 文档现以 `text/plain; charset=utf-8` string 与 `Forbidden` / `Not found` examples 描述实际 runtime。若未来选择 JSON error，先为资源消费者定义不依赖 body 的 error UX，并改写 runtime 与测试。
3. **P1：持续验证 binary response headers。** media OpenAPI 已列出 `Content-Length`、`Cache-Control`、`Content-Security-Policy`、`X-Content-Type-Options`，并明确当前不声明或实现 `Range` / `206` / `Content-Range`。未来若实现 Range，需同步增加 runtime、OpenAPI 与测试。
4. **已关闭（EX-04）：资源 example 策略已明确。** Presence 200 已有 file-backed opening snapshot SSE frame；两个 preview 维持“仅 200、无受控错误”，并以 `x-example-policy.mode: explicit-exemption` 记录不提交 SVG byte fixture、也不伪造 JSON failure payload。若生产 adapter 可能失败，应另定义 resource-safe 4xx/5xx（建议 text/plain 或 SVG fallback，而非无消费者的 JSON），同时增加图像加载失败 UI 契约。stitch `seq` 已按 runtime 记录为宽容 string，只有 `"1"` 启用序号。
5. **P1：增加 transport-aware runtime contract suite。** 现有 OpenAPI test 主要验证 operation 集合、成功 transport 和文档 response ref；route-level test 现已断言 Presence GET invalid query / successful snapshot、Presence POST heartbeat/lease success 与 lease conflict/expired lease，以及 media 200/403/404 headers、两个 preview 的默认/边界参数与 SVG content type。listener-limit 需先把容量预检移动到 `Response` 构造前，才可作为 HTTP `429` wire assertion。
6. **P2：补足特殊 transport 的可观测边界。** JSON client 已保留 `requestId`；SSE client 应记录握手前 HTTP status/body 中的 requestId（若已迁移）并把已建连异常和 HTTP rejection 分为不同诊断事件；media/preview 仅记录 URL、HTTP status 和安全的 response metadata，避免读取或暴露资源字节。

## 验收基线

以下是后端接入前可执行的最小断言，而不是本次审计已修改的实现：

- Presence 的参数校验错误与 POST 受控错误可按 OpenAPI schema 解析，并有 `requestId`；GET `200` 始终是 SSE，首个业务事件是 snapshot。listener 上限当前不是可声明的 HTTP `429` 握手 contract。
- Presence 的 heartbeat、lease acquire/renew/release success body 均由 handler route test 以 schema 解析；lease conflict 与 expired lease 分别保留 `EDIT_LEASE_CONFLICT` 与 `SESSION_EXPIRED`，客户端的 blocked/retry/follow 状态不回归。
- media 403/404 的实际 OpenAPI content type、body 与 runtime 完全一致；成功资源不丢失 containment、CSP、nosniff 与 immutable cache 防护。
- preview 的 success SVG 和缓存策略有稳定测试；OpenAPI 的显式 byte-fixture exemption 已锁定为仅 200、无伪造 failure payload；若未来声明 failure response，则页面级 image failure 行为也有测试。
- 特殊 transport 的 error 表不得被 generic JSON handler 的覆盖率或 `ErrorResponse` schema existence 误判为已交付。
