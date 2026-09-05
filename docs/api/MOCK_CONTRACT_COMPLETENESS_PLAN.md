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

按这个口径解析现有 manifest/OpenAPI：**55 paths / 92 operations**；**28** 个 operation 没有 direct-success runtime smoke；**44** 个 operation 没有 payload-level example metadata；成功 transport 为 SSE/binary 的 operation 有 **4** 个。该数字是当前代码快照，不把工作区的其他未提交并行改动纳入依据。

### 自动核对规则（后续实现必须遵守）

1. 从 `LOCAL_API_ROUTES` 取得唯一 `operationId` 列表；测试和 example ledger 只以该 ID 作为键，不以相似 path 文本猜测归属。
2. OpenAPI example checker 只检查 `requestBody.content` 与 `responses[*].content` 下的 `example` / `examples`，因此当前 44 是可重算的，不会因 header sample 误减。
3. runtime matrix 对每个 JSON operation 至少写 `success` 断言；存在受控错误 branch 时还写 `failure` 断言，且以 `LocalErrorEnvelopeSchema` 验证 status、`error.code`、`requestId`。写命令还需有 replay 和同 key 不同 payload 的 conflict 行（若该 contract 声明 idempotency）。
4. SSE/binary 不能被 JSON matrix 代替：它们有独立的 body/headers/stream-first-frame 断言，见“特殊 transport”章节。

## 92-operation coverage ledger

`无 runtime smoke` 是上表定义的“没有直接 2xx handler 执行”而非“完全没有任何测试”。例如 Agent、Jobs 与 Presence 的若干 operation 已有 400 输入校验测试，但仍在此列，因为尚未证明成功 wire response。`缺 payload example` 列完整列出当前 44 个 operationId；`—` 表示该 domain 当前没有该类缺口。

| Domain / manifest tag | Operations | 无 runtime smoke（operationId） | 缺 payload example metadata（operationId） | 特殊 transport / 独立缺口 |
| --- | ---: | --- | --- | --- |
| Account | 14 | — | `getAccountProfile`, `getLocalIdentity`, `updateLocalSession`, `getLocalPreferences`, `updateLocalPreferences`, `getNotificationSummary`, `markNotificationsRead`, `getLocalTeam`, `getLocalSharedAssets` | local-display-projection 的匿名 200 语义须与未来受保护资源迁移分开测试。 |
| Agent | 7 | `sendAgentMessage`, `resolveAgentMessage`, `getAgentSession`, `updateAgentSession`, `deleteAgentSession`, `listAgentSessions`, `createAgentSession` | — | `createAgentSession` 现仅有 malformed 400 handler evidence，不能代表其他 6 个 operation。 |
| Assets | 11 | `registerArtifactAsAsset`, `uploadAsset`, `cancelAssetUpload` | `previewCharacterReference`, `previewStoryboardStitch` | `readLocalMedia`、两个 preview 见特殊 transport；upload 是 multipart，不能使用 JSON-only matrix。 |
| Canvases | 4 | `getCanvas`, `renameCanvas`, `deleteCanvas`, `createCanvas` | `getCanvas`, `renameCanvas`, `deleteCanvas`, `createCanvas` | 与 `mutateCanvas` 共用 document/revision 状态；不可只按 CRUD status 断言。 |
| Creation Context | 3 | — | `getHomeCreationContext`, `saveHomeCreationContext`, `submitHomeCreationContext` | — |
| Development | 3 | — | — | production 403 是 deployment guard，不应被普通成功 matrix 漏掉。 |
| Folders | 3 | — | — | — |
| Jobs | 4 | `getGenerationJob`, `transitionGenerationJob`, `listGenerationJobs`, `createGenerationJob` | — | create/transition 现有输入 400 断言；仍缺成功 queue/retry/cancel wire matrix。 |
| Ledger | 1 | — | `listLedgerEntries` | scenario balance/entries 排序须作为 success schema 断言。 |
| Materials | 3 | — | — | — |
| Models | 1 | — | — | — |
| Presence | 2 | — | `getCanvasPresence` | `getCanvasPresence` 是 SSE；`updateCanvasPresence` 是其 heartbeat/lease JSON companion。 |
| Projects | 7 | — | `getProject`, `updateProject`, `deleteProject`, `duplicateProject`, `listProjects`, `getHomeDiscovery` | — |
| Publish | 5 | `revokePublishedSnapshot`, `listPublishedSnapshots`, `publishCanvas` | `getPublishedSnapshot`, `revokePublishedSnapshot`, `listPublishedSnapshots`, `publishCanvas` | frozen snapshot、private clone 和 revoke 的可见性必须分开覆盖。 |
| Recycle Bin | 3 | — | `listRecycleBin`, `restoreRecycledProject`, `permanentlyDeleteRecycledProject` | — |
| Script V2 | 4 | `quoteScriptV2`, `createScriptV2Run`, `getScriptV2Run`, `transitionScriptV2Run` | — | E2E 已覆盖主要 UI 状态；仍缺 handler-level success/error wire matrix。 |
| Showcase | 5 | — | `getShowcaseDetail`, `getShowcasePlaybackManifest`, `listShowcaseEntries` | playback media manifest 是 JSON，不可与 media byte route 合并。 |
| Skills | 8 | `getSkill`, `toggleSkillFavorite` | `getSkill`, `toggleSkillFavorite`, `listSkills`, `listAuthoredSkills`, `createAuthoredSkill`, `getAuthoredSkill`, `updateAuthoredSkill`, `transitionAuthoredSkill` | author lifecycle 已有 direct route flow；缺 operation-bound OpenAPI payload examples。 |
| Video | 3 | — | — | compose 已有主 lifecycle smoke；后续矩阵仍须覆盖所有声明的 failure status。 |
| Workflow | 1 | `mutateCanvas` | — | revision conflict、atomic mutation 与 document projection 是一个 operation 的同一 contract。 |
| **Total** | **92** | **28** | **44** | **4 SSE/binary success transports** |

### 已有但仍属 partial 的 direct evidence

下列 operation 不在“无 runtime smoke”列，是因为存在 handler 成功路径；这不等同于完整 matrix。后续派工不得把它们视为已完成错误、授权和幂等覆盖：Asset folder/list/delete、Access Key、Account/Identity/Preferences/Notifications/Team/Shared Assets、Folder rename/create、Project write/list、Recycle Bin、Publish read/clone、Showcase、Skills author/list、Creation Context、Compose、Materials、Models、Development scenario、media 与 preview。

## 特殊 transport ledger

| operationId | 实际 transport | 已有证据 | 未关闭的 wire 任务 | 下一测试落点 |
| --- | --- | --- | --- | --- |
| `getCanvasPresence` | `text/event-stream` | handler test 解析 `200` 的 SSE headers、连接注释后的第一个业务 `snapshot` frame，并以 participant schema 验证其数据。建流前 invalid input `400` 仍解析完整 ErrorResponse。 | listener 上限是 stream 初始化期的资源边界；已建流失败只能 close/reconnect，不能伪造 JSON response。 | `src/app/api/presence/[canvasId]/route.test.ts`，单独解析 SSE text frames。 |
| `updateCanvasPresence` | JSON（Presence companion） | handler test 覆盖 heartbeat 与 lease acquire/renew/release success schema，以及 `EDIT_LEASE_CONFLICT`、`SESSION_EXPIRED` / requestId / details。 | 后续可补 participant/connection limit 的完整压测；`src/server/__tests__/presence-lease.test.ts` 只作为状态机辅助，不替代 handler test。 | 同一 presence route test。 |
| `readLocalMedia` | binary + plain-text error | `media-route-traversal.test.ts` 已验证 200/403/404、containment、CSP/nosniff/cache；403/404 的 plain-text payload samples 已使其不属于当前 44 个 example 缺口。 | 维持 Range 未实现的明确断言；如未来需要成功 binary specimen，另加 fixture/external-value，但不能伪造 JSON payload 或把该可选增强记作当前缺口。 | 扩展现有 media test 与 OpenAPI contract test。 |
| `previewCharacterReference` | SVG binary | preview route test 验证成功 SVG、缓存、参数归一化/escape。 | 无受控 failure branch；明确该 policy 或先新增 resource-safe failure 设计后再写 4xx assertions。增加 SVG fixture/external-value 或 exemption。 | `src/app/api/preview/preview-route.test.ts` 与 `SPECIAL_TRANSPORT_CONTRACT_AUDIT.md`。 |
| `previewStoryboardStitch` | SVG binary | preview route test 验证 rows/cols、`seq`、缓存。 | 同 character preview：当前只承诺 200；不得把不存在的 JSON error 标成已覆盖。 | 同上。 |

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

## 下一批互不重叠的 example/document cuts

所有 JSON example 均应是 fixture-stable 文件，挂到 `components.examples` 后由 operation `requestBody`/`responses` `$ref` 使用，并在 `src/contracts/__tests__/openapi.test.ts` 解析对应 schema。每个写命令应至少包含 request、success、一个受控 failure；带幂等键的命令额外包含 replay/conflict。以下计划恰好覆盖当前 44 个缺口，互不重复。

```yaml
example_cuts:
  - id: EX-01-account-skills
    operations: [getAccountProfile, getLocalIdentity, updateLocalSession, getLocalPreferences, updateLocalPreferences, getNotificationSummary, markNotificationsRead, getLocalTeam, getLocalSharedAssets, listLedgerEntries, getSkill, toggleSkillFavorite, listSkills, listAuthoredSkills, createAuthoredSkill, getAuthoredSkill, updateAuthoredSkill, transitionAuthoredSkill]
    count: 18
    deliverables: [response_examples_for_reads, request_success_failure_for_writes, local_display_projection_examples]
  - id: EX-02-document-project-recycle
    operations: [getCanvas, renameCanvas, deleteCanvas, createCanvas, getHomeCreationContext, saveHomeCreationContext, submitHomeCreationContext, getProject, updateProject, deleteProject, duplicateProject, listProjects, getHomeDiscovery, listRecycleBin, restoreRecycledProject, permanentlyDeleteRecycledProject]
    count: 16
    deliverables: [revision_aware_canvas_examples, project_lifecycle_examples, recycle_retention_examples]
  - id: EX-03-public-read
    operations: [getPublishedSnapshot, revokePublishedSnapshot, listPublishedSnapshots, publishCanvas, getShowcaseDetail, getShowcasePlaybackManifest, listShowcaseEntries]
    count: 7
    deliverables: [public_success_examples, protected_write_failure_examples, frozen_snapshot_invariants]
  - id: EX-04-special-resource
    operations: [getCanvasPresence, previewCharacterReference, previewStoryboardStitch]
    count: 3
    deliverables: [sse_snapshot_frame_example, svg_external_value_or_explicit_exemption]
```

`EX-04` 不含 `readLocalMedia`：它的 403/404 plain-text response 已附 operation payload sample，故不属于当前 44 个 example 缺口。四个 cut 的计数为 `18 + 16 + 7 + 3 = 44`，与上方 ledger 一致；将 future binary success specimen 作为可选增强时，不得改变此审计基线。

## 完成门

一个 operation 只有在以下条件全部满足时，才可从该计划的缺口列移除：

1. `LOCAL_API_ROUTES`、OpenAPI path/method/operationId 仍一致；
2. 直接 handler success smoke 通过，JSON success 经准确 schema 解析；
3. 其受控 error branch（若有）经 `LocalErrorEnvelopeSchema` 或声明的 resource error transport 验证；
4. OpenAPI 附有 operation-bound payload example，或 binary/SSE operation 有被测试锁定的、明确记录的 `externalValue`/exemption；
5. 写入路径另外验证 replay/conflict（若 contract 有 `idempotencyKey`）；
6. 专项 transport 没有被 generic JSON matrix 误记为完成。

达到这六项前，`API_AUD-03`、`API-AUD-06`、`API-AUD-07` 所代表的 wire completeness 仍应保持未关闭状态。
