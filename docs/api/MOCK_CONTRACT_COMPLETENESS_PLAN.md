# Mock Contract Completeness Plan

> 审计日期：2026-09-05  
> 输入：`docs/CODEBASE_MAP.md`、`src/contracts/route-manifest.ts`、`docs/api/openapi.yaml`、`docs/api/API_AUDIT.md`、`docs/api/ROUTE_COVERAGE.md` 与现有直接 Route Handler tests。  
> 范围：当前 frontend-only、本地 fixture API；不改变 UI、Route Handler、CI 或 package 配置。

## 可复算口径

此计划把“存在测试/文档”拆成可执行的三种证据，避免把 E2E、Zod schema 或某个相邻 endpoint 的测试误记为该 operation 的 wire 覆盖。

| 维度 | 本文判定 | 不计入的近似证据 |
| --- | --- | --- |
| Direct runtime smoke | 测试直接 import 对应 `src/app/api/**/route.ts` 的 handler，并执行该 operation 的成功（2xx）路径；JSON 成功体应由相应 Zod schema 解析，resource 成功体应断言声明的 content type/关键 headers。 | 只测试 server service、只测试 request schema、E2E、或仅执行 4xx。 |
| Payload example metadata | OpenAPI operation 的 `requestBody.content.*.example(s)` 或 `responses.*.content.*.example(s)` 有 payload-level example/ref。response header 的 `example` 不计为 payload 样本。 | 仅有 schema、仅有 README/专题文档中的示意 JSON、或未接到 operation 的 `components.examples`。 |
| Special transport | `LOCAL_API_ROUTES.transport` 为 `sse` 或 `binary`；此外 Presence POST 是与 SSE room 共享状态机的 JSON companion，单列其 room/lease 约束。 | 通用 `application/json` 的 schema existence。 |

按这个口径解析现有 manifest/OpenAPI：**55 paths / 92 operations**；**28** 个 operation 没有 direct-success runtime smoke；mock example coverage ledger 当前为 **90** 个 payload-level example 覆盖、**2** 个显式 resource exemption、**0** 个缺口；成功 transport 为 SSE/binary 的 operation 有 **4** 个。examples 数量由 `src/contracts/__tests__/openapi.test.ts` 实际解析 `docs/api/openapi.yaml` 得出，不以本文手工清单作为测试输入。

### 自动核对规则（后续实现必须遵守）

1. 从 `LOCAL_API_ROUTES` 取得唯一 `operationId` 列表；测试和 example ledger 只以该 ID 作为键，不以相似 path 文本猜测归属。
2. `mockExampleCoverageLedger` 为每个 manifest `operationId` 收集 `requestBody.content` 与 `responses[*].content` 下的 `example` / `examples` binding，并要求每个 named example 是可解析的 inline value、`#/components/examples/*` reference 或本地可读的 `externalValue`；header sample 不计入 payload 覆盖。
3. 只有 `previewCharacterReference` 与 `previewStoryboardStitch` 可使用 `x-example-policy.mode: explicit-exemption`；账本断言这两个 operation 具备明确 policy，其他 operation 必须至少有一个 payload binding。新增 operation 会自动进入账本，未绑定样本时聚焦 Vitest 会列出其 `operationId`。
4. runtime matrix 对每个 JSON operation 至少写 `success` 断言；存在受控错误 branch 时还写 `failure` 断言，且以 `LocalErrorEnvelopeSchema` 验证 status、`error.code`、`requestId`。写命令还需有 replay 和同 key 不同 payload 的 conflict 行（若该 contract 声明 idempotency）。
5. SSE/binary 不能被 JSON matrix 代替：它们有独立的 body/headers/stream-first-frame 断言，见“特殊 transport”章节。

## 92-operation coverage ledger

`无 runtime smoke` 是上表定义的“没有直接 2xx handler 执行”而非“完全没有任何测试”。例如 Agent、Jobs 与 Presence 的若干 operation 已有 400 输入校验测试，但仍在此列，因为尚未证明成功 wire response。`mock example coverage` 是聚焦 OpenAPI test 的真实账本快照：`payload` 表示 operation-bound `example(s)`，`exemption` 只适用于可重复验证的 SVG byte resource。

| Domain / manifest tag | Operations | 无 runtime smoke（operationId） | mock example coverage（真实解析） | 特殊 transport / 独立缺口 |
| --- | ---: | --- | --- | --- |
| Account | 14 | — | 14 payload | local-display-projection 的匿名 200 语义须与未来受保护资源迁移分开测试。 |
| Agent | 7 | `sendAgentMessage`, `resolveAgentMessage`, `getAgentSession`, `updateAgentSession`, `deleteAgentSession`, `listAgentSessions`, `createAgentSession` | 7 payload | `createAgentSession` 现仅有 malformed 400 handler evidence，不能代表其他 6 个 operation。 |
| Assets | 11 | `registerArtifactAsAsset`, `uploadAsset`, `cancelAssetUpload` | 9 payload；2 exemption（`previewCharacterReference`、`previewStoryboardStitch`） | `readLocalMedia`、两个 preview 见特殊 transport；upload 是 multipart，不能使用 JSON-only matrix。 |
| Canvases | 4 | `getCanvas`, `renameCanvas`, `deleteCanvas`, `createCanvas` | 4 payload | 与 `mutateCanvas` 共用 document/revision 状态；不可只按 CRUD status 断言。 |
| Creation Context | 3 | — | 3 payload | — |
| Development | 3 | — | 3 payload | production 403 是 deployment guard，不应被普通成功 matrix 漏掉。 |
| Folders | 3 | — | 3 payload | — |
| Jobs | 4 | `getGenerationJob`, `transitionGenerationJob`, `listGenerationJobs`, `createGenerationJob` | 4 payload | create/transition 现有输入 400 断言；仍缺成功 queue/retry/cancel wire matrix。 |
| Ledger | 1 | — | 1 payload | scenario balance/entries 排序须作为 success schema 断言。 |
| Materials | 3 | — | 3 payload | — |
| Models | 1 | — | 1 payload | — |
| Presence | 2 | — | 2 payload | `getCanvasPresence` 是 SSE；`updateCanvasPresence` 是其 heartbeat/lease JSON companion。 |
| Projects | 7 | — | 7 payload | — |
| Publish | 5 | `revokePublishedSnapshot`, `listPublishedSnapshots`, `publishCanvas` | 5 payload | frozen snapshot、private clone 和 revoke 的可见性必须分开覆盖。 |
| Recycle Bin | 3 | — | 3 payload | — |
| Script V2 | 4 | `quoteScriptV2`, `createScriptV2Run`, `getScriptV2Run`, `transitionScriptV2Run` | 4 payload | E2E 已覆盖主要 UI 状态；仍缺 handler-level success/error wire matrix。 |
| Showcase | 5 | — | 5 payload | playback media manifest 是 JSON，不可与 media byte route 合并。 |
| Skills | 8 | `getSkill`, `toggleSkillFavorite` | 8 payload | author lifecycle 已有 direct route flow；payload binding 已由账本锁定。 |
| Video | 3 | — | 3 payload | compose 已有主 lifecycle smoke；后续矩阵仍须覆盖所有声明的 failure status。 |
| Workflow | 1 | `mutateCanvas` | 1 payload | revision conflict、atomic mutation 与 document projection 是一个 operation 的同一 contract。 |
| **Total** | **92** | **28** | **90 payload + 2 exemption（0 gaps）** | **4 SSE/binary success transports** |

### 已有但仍属 partial 的 direct evidence

下列 operation 不在“无 runtime smoke”列，是因为存在 handler 成功路径；这不等同于完整 matrix。后续派工不得把它们视为已完成错误、授权和幂等覆盖：Asset folder/list/delete、Access Key、Account/Identity/Preferences/Notifications/Team/Shared Assets、Folder rename/create、Project write/list、Recycle Bin、Publish read/clone、Showcase、Skills author/list、Creation Context、Compose、Materials、Models、Development scenario、media 与 preview。

## 特殊 transport ledger

| operationId | 实际 transport | 已有证据 | 未关闭的 wire 任务 | 下一测试落点 |
| --- | --- | --- | --- | --- |
| `getCanvasPresence` | `text/event-stream` | handler test 解析 `200` 的 SSE headers、连接注释后的第一个业务 `snapshot` frame，并以 participant schema 验证其数据。建流前 invalid input `400` 仍解析完整 ErrorResponse。 | listener 上限是 stream 初始化期的资源边界；已建流失败只能 close/reconnect，不能伪造 JSON response。 | `src/app/api/presence/[canvasId]/route.test.ts`，单独解析 SSE text frames。 |
| `updateCanvasPresence` | JSON（Presence companion） | handler test 覆盖 heartbeat 与 lease acquire/renew/release success schema，以及 `EDIT_LEASE_CONFLICT`、`SESSION_EXPIRED` / requestId / details。 | 后续可补 participant/connection limit 的完整压测；`src/server/__tests__/presence-lease.test.ts` 只作为状态机辅助，不替代 handler test。 | 同一 presence route test。 |
| `readLocalMedia` | binary + plain-text error | `media-route-traversal.test.ts` 已验证 200/403/404、containment、CSP/nosniff/cache；403/404 的 plain-text payload sample 已在自动账本中计为 payload 覆盖。 | 维持 Range 未实现的明确断言；如未来需要成功 binary specimen，另加 fixture/external-value，但不能伪造 JSON payload。 | 扩展现有 media test 与 OpenAPI contract test。 |
| `previewCharacterReference` | SVG binary | preview route test 验证成功 SVG、缓存、参数归一化/escape；OpenAPI 的 `x-example-policy` 已作为账本 exemption 锁定。 | 无受控 failure branch；若增加 failure contract，需同时添加 operation-bound payload example。 | `src/app/api/preview/preview-route.test.ts` 与 `SPECIAL_TRANSPORT_CONTRACT_AUDIT.md`。 |
| `previewStoryboardStitch` | SVG binary | preview route test 验证 rows/cols、`seq`、缓存；OpenAPI 的 `x-example-policy` 已作为账本 exemption 锁定。 | 同 character preview：当前只承诺 200；不得把不存在的 JSON error 标成已覆盖。 | 同上。 |

## 下一批互不重叠的 runtime-test cuts

这些 cut 只增加 Route Handler/contract tests 和文档，不改 UI、handler、CI/package。一个 cut 合并前应只触及自己的 test files 与对应审计条目，避免多个 agent 修改同一 route test。

```yaml
runtime_cuts:
  - id: RT-01-canvas-workflow
    operations: [getCanvas, renameCanvas, deleteCanvas, createCanvas, mutateCanvas]
    files: [src/app/api/canvases/route.test.ts, src/app/api/canvases/[canvasId]/route.test.ts]
    assertions: [success_schema, invalid_input_error, not_found_error, revision_conflict, atomic_document_projection]
  - id: RT-02-jobs-script
    operations: [getGenerationJob, transitionGenerationJob, listGenerationJobs, createGenerationJob, quoteScriptV2, createScriptV2Run, getScriptV2Run, transitionScriptV2Run]
    files: [src/app/api/jobs/route.test.ts, src/app/api/jobs/[jobId]/route.test.ts, src/app/api/script-v2/quotes/route.test.ts, src/app/api/script-v2/runs/route.test.ts, src/app/api/script-v2/runs/[runId]/route.test.ts]
    assertions: [success_schema, invalid_input_error, not_found_error, state_transition, replay_and_conflict]
  - id: RT-03-agent
    operations: [sendAgentMessage, resolveAgentMessage, getAgentSession, updateAgentSession, deleteAgentSession, listAgentSessions, createAgentSession]
    files: [src/app/api/agent/sessions/route.test.ts, src/app/api/agent/sessions/[sessionId]/route.test.ts]
    assertions: [success_schema, after_seq_cursor, ask_human_resolution, not_found_error, delete_projection]
  - id: RT-04-assets-publish
    operations: [registerArtifactAsAsset, uploadAsset, cancelAssetUpload, revokePublishedSnapshot, listPublishedSnapshots, publishCanvas]
    files: [src/app/api/assets/upload/route.test.ts, src/app/api/assets/route.test.ts, src/app/api/publish/route.test.ts, src/app/api/publish/[snapshotId]/route.test.ts]
    assertions: [success_schema, multipart_partial_success, cancellation_replay, visibility_boundary, frozen_snapshot]
  - id: RT-06-special-transport
    operations: [getCanvasPresence, updateCanvasPresence, readLocalMedia, previewCharacterReference, previewStoryboardStitch]
    files: [src/app/api/presence/[canvasId]/route.test.ts, src/server/__tests__/media-route-traversal.test.ts, src/app/api/preview/preview-route.test.ts]
    assertions: [content_type, cache_and_security_headers, stream_first_frame, transport_specific_error_policy]
```

`RT-05-account-project-ops` 已由五个 dedicated handler smoke 完成：handoffs 登录/匿名 display projection、ledger schema/limit、dev reset 成功/production guard、folder 删除确认/认证/404，以及 project detail 的认证/会话过期/404。`RT-01` 和 `RT-02` 最接近 Workflow/Video 主链，应优先；`RT-06` 不与 JSON matrix 合并。`RT-04` 的 upload test 文件若已有并行未提交工作，先等待其提交/清理再开新 agent，避免覆盖同一文件。

## Mock example 账本维护

所有 JSON example 均应是 fixture-stable 文件，以 inline value、`components.examples` reference 或 operation-local `externalValue` 绑定到 `requestBody`/`responses`，并在 `src/contracts/__tests__/openapi.test.ts` 解析对应 schema。每个写命令应至少包含 request、success、一个受控 failure；带幂等键的命令额外包含 replay/conflict。

账本不是复制到本文的 operationId 列表：测试从 `LOCAL_API_ROUTES` 遍历全部 operation，并从已解析的 OpenAPI request/response media type 生成 payload bindings。当前真实结果为 **90 payload / 2 explicit exemption / 0 gap**。运行：

```bash
pnpm vitest run src/contracts/__tests__/openapi.test.ts
```

新增或变更 operation 时，先添加 operation-bound example；仅稳定、可由专用 transport test 验证且不适合伪造 payload 的资源，才可把其 `operationId` 加入 `EXPLICIT_MOCK_EXAMPLE_EXEMPTIONS` 和 OpenAPI 的 `x-example-policy`。这会让 manifest、OpenAPI policy 与账本断言在同一次聚焦验证中同步失效，而不是依赖本文的手填数字。

## 完成门

一个 operation 只有在以下条件全部满足时，才可从该计划的缺口列移除：

1. `LOCAL_API_ROUTES`、OpenAPI path/method/operationId 仍一致；
2. 直接 handler success smoke 通过，JSON success 经准确 schema 解析；
3. 其受控 error branch（若有）经 `LocalErrorEnvelopeSchema` 或声明的 resource error transport 验证；
4. OpenAPI 附有 operation-bound payload example，或它是 `EXPLICIT_MOCK_EXAMPLE_EXEMPTIONS` 中被专用 transport test 锁定的资源 exemption；
5. 写入路径另外验证 replay/conflict（若 contract 有 `idempotencyKey`）；
6. 专项 transport 没有被 generic JSON matrix 误记为完成。

达到这六项前，`API_AUD-03`、`API-AUD-06`、`API-AUD-07` 所代表的 wire completeness 仍应保持未关闭状态。
