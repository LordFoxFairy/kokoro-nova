# LibTV Script V2 Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simplified Script wizard with a deterministic, refresh-safe, API-documented reproduction of LibTV Script V2's node generator, three-stage workspace, asset lifecycle, dual prompt tracks and batch materialization flows.

**Architecture:** Persist one versioned `ScriptV2State` under `node.data.extra.scriptV2`, normalize all legacy shapes through a pure domain reader, and keep UI components as projections over immutable state transitions. Script-only asynchronous work uses typed local `/api/script-v2` quote/run endpoints; canvas state and batch graph creation continue through the existing revision-guarded mutation endpoint.

**Tech Stack:** Next.js 15 Route Handlers, React 19, TypeScript 5.9, Zustand, Zod 3, React Flow 12, Vitest 3, Playwright 1.56, Tailwind CSS 4, OpenAPI 3.1.

## Global Constraints

- The official LibTV website remains the primary source for visible labels, ordering, gating, state transitions and external protocol evidence.
- This is a frontend-only local fixture: no real LibTV, model, ComfyUI, payment, authentication, storage or database call may be introduced.
- Do not persist official cookies, tokens, access keys, account values, project/node/request/session/trace identifiers or private media URLs.
- New Script V2 writes use only `node.data.extra.scriptV2`; legacy `draft` and `shots` are read-only migration inputs.
- Prompt recompute batches contain at most 20 target shots and at most 100 context shots.
- Duration is an integer from 5 through 15 seconds; shot size is one of the 12 observed labels.
- Image and video prompts have independent text, entity references and state.
- Every canvas graph batch is one revision transaction and one undo frame.
- User-owned untracked `.gitignore` remains untouched.
- Restore generated `next-env.d.ts` and unrelated Playwright screenshots before every commit.

---

## File Structure

### Domain and contracts

- Create `src/domain/script-v2.ts`: canonical state, reader/migration, reducers, fingerprints, gating, official adapters and CSV export.
- Create `src/domain/script-v2-mock.ts`: deterministic script, asset, prompt and batch graph builders.
- Create `src/domain/__tests__/script-v2.test.ts`: pure model and migration tests.
- Create `src/domain/__tests__/script-v2-mock.test.ts`: deterministic result and graph topology tests.
- Create `src/contracts/script-v2.ts`: state, quote and run schemas plus inferred types.
- Create `src/contracts/__tests__/script-v2-examples.test.ts`: executable documentation examples.
- Modify `src/contracts/local.ts`: embed `ScriptV2StateSchema` in `NodeExtraSchema`.
- Modify `src/contracts/route-manifest.ts`: register Script V2 endpoints and UI triggers.

### Mock API

- Create `src/server/script-v2.ts`: in-process idempotent run repository and deterministic polling clock.
- Create `src/app/api/script-v2/quotes/route.ts`: validated quote endpoint.
- Create `src/app/api/script-v2/runs/route.ts`: validated submit endpoint.
- Create `src/app/api/script-v2/runs/[runId]/route.ts`: validated poll/cancel/retry endpoint.
- Modify `src/api/client.ts`: typed `scriptV2.quote/createRun/getRun/transitionRun` methods.
- Modify `src/api/__tests__/client.test.ts`: transport and malformed response tests.

### UI

- Create `src/components/script/ScriptV2NodeEditor.tsx`: attached generator, model catalog and entry actions.
- Create `src/components/script/ScriptV2Workspace.tsx`: full-screen shell, stage navigation and orchestration.
- Create `src/components/script/ScriptV2ShotTable.tsx`: semantic table, cell popovers, row reorder/color/delete.
- Create `src/components/script/ScriptV2Assets.tsx`: grouped asset stage and asset cards.
- Create `src/components/script/ScriptV2Prompts.tsx`: dual-track prompt and batch compose surfaces.
- Create `src/components/script/ScriptV2Dialogs.tsx`: source, AI asset, batch asset, batch graph and delete confirmations.
- Modify `src/components/script/ScriptWizard.tsx`: leave legacy implementation available as `LegacyScriptWizard`.
- Modify `src/components/canvas/NodeCard.tsx`: render V2 card/editor independently from legacy script.
- Modify `src/components/canvas/WorkflowCanvas.tsx`: pass `onOpenScriptWorkspace` into V2 cards.
- Modify `src/components/canvas/CanvasWorkspace.tsx`: persist V2 state and materialize batches atomically.
- Modify `src/domain/factory.ts`: initialize complete V2 state and keep legacy state separate.

### Documentation and verification

- Create `docs/research/libtv/api/captures/2026-09-03-script-v2.md`.
- Create `docs/api/SCRIPT_V2_STATE.md`.
- Create six sanitized JSON examples under `docs/api/examples/script-v2-*.json`.
- Modify `docs/api/openapi.yaml`, `docs/api/README.md`, `docs/research/libtv/api/ENDPOINTS.md`, and `docs/research/libtv/pages/canvas/README.md`.
- Create `e2e/script-v2.spec.ts` and Script V2 snapshots in `e2e/__snapshots__/script-v2.spec.ts-snapshots/`.

---

### Task 1: Freeze the canonical Script V2 domain contract

**Files:**
- Create: `src/domain/__tests__/script-v2.test.ts`
- Create: `src/domain/script-v2.ts`
- Modify: `src/components/script/script-model.ts`

**Interfaces:**
- Produces: `ScriptV2State`, `ScriptV2Row`, `ScriptV2Asset`, `ScriptV2PromptTrack`, `ScriptV2PromptState`.
- Produces: `defaultScriptV2State(seed?: string): ScriptV2State`.
- Produces: `readScriptV2State(extra: Record<string, unknown> | undefined, seed?: string): ScriptV2State`.
- Produces: `updateScriptV2Row(state, rowId, patch): ScriptV2State`, `moveScriptV2Row(state, from, to): ScriptV2State`, `removeScriptV2Row(state, rowId): ScriptV2State`, `appendScriptV2Row(state): ScriptV2State`.
- Consumes: existing screenplay parsing and asset extraction helpers from `src/components/script/script-model.ts` until Task 10 removes duplicate ownership.

- [x] **Step 1: Write failing vocabulary and default-state tests**

```ts
expect(SCRIPT_V2_SHOT_SIZES).toEqual([
  '大远景', '远景', '全景', '中远景', '中景', '中近景',
  '近景', '特写', '大特写', '头肩景', '半身景', '全身景',
])
expect(defaultScriptV2State('script-seed')).toMatchObject({
  version: 1,
  activeStage: 'shots',
  rows: [],
  assets: { characters: [], scenes: [], props: [] },
  generator: { modelId: 'gvlm-3.1', translating: true },
  promptComposer: { singleMode: 'smart', batchMode: 'smart' },
})
```

- [x] **Step 2: Run the focused test and verify missing exports fail**

Run: `pnpm vitest run src/domain/__tests__/script-v2.test.ts`

Expected: FAIL because `@/domain/script-v2` does not exist.

- [x] **Step 3: Implement canonical state and stable seeded factories**

Implement integer duration clamping, stable ids derived from `seed + ordinal`, empty asset buckets, explicit generator state and explicit prompt composer state. Keep viewport-only modal visibility out of persisted state.

- [x] **Step 4: Add failing row-transition tests**

Cover append inheritance, dense renumbering after move/delete, color label non-staleness, content edit staleness, `user_edited → user_edited_stale`, and independent image/video prompt state.

- [x] **Step 5: Implement row reducers and fingerprint reconciliation**

Use these signatures:

```ts
export function scriptV2TextFingerprint(row: ScriptV2Row): string
export function scriptV2PayloadFingerprint(row: ScriptV2Row): string
export function reconcileScriptV2PromptState(
  before: ScriptV2Row,
  after: ScriptV2Row,
): ScriptV2Row
```

- [x] **Step 6: Run domain tests**

Run: `pnpm vitest run src/domain/__tests__/script-v2.test.ts`

Expected: PASS.

- [x] **Step 7: Commit Task 1**

```bash
git add src/domain/script-v2.ts src/domain/__tests__/script-v2.test.ts src/components/script/script-model.ts
git commit -m "feat: define canonical script v2 state"
```

### Task 2: Migrate legacy drafts and implement official adapters

**Files:**
- Modify: `src/domain/__tests__/script-v2.test.ts`
- Modify: `src/domain/script-v2.ts`

**Interfaces:**
- Produces: `migrateLegacyScriptDraft(extra, seed): ScriptV2State` through `readScriptV2State`.
- Produces: `serializeOfficialScriptNode(state): OfficialScriptNodeData`.
- Produces: `buildOfficialScriptGenerationEnvelope(input): OfficialScriptGenerationEnvelope`.
- Produces: `buildOfficialPromptRecomputeEnvelope(input): OfficialPromptRecomputeEnvelope`.
- Produces: `parseOfficialScriptResult(payload, options?): ScriptV2TaskResult`.
- Produces: `resolveScriptV2PromptWriteback(input): ScriptV2State`.

- [x] **Step 1: Add a failing migration test using the current `ScriptDraft` shape**

Assert that `description → plotDescription`, `index → shotNumber`, `sfx → audioEffects`, `cameraMove → cinematics.cameraMovement`, `finalPrompt → imageGenerationPrompt`, flat assets → role buckets, and detected `assetRefs` survive migration.

- [x] **Step 2: Add failing malformed-import tests**

Feed non-object state, invalid duration, unknown shot size, duplicate row ids, malformed refs and unknown prompt states. Assert safe defaults, 5–15 clamping, stable replacement ids and no thrown exception.

- [x] **Step 3: Implement strict structural readers without JSON stringify casts**

The reader must preserve recognized fields, discard prototype-bearing objects, cap rows at 500, cap each asset bucket at 500 and derive missing fingerprints after normalization.

- [x] **Step 4: Add failing official serialization tests**

Assert exact snake_case names, optional field elision, spoken-text marker stripping, normalized entity refs, `script-generate-v2`, `script-recompute-prompts-v2`, `source_images` and `context_shots.slice(0, 100)`.

- [x] **Step 5: Implement official envelope builders with a hard 20-shot check**

`buildOfficialPromptRecomputeEnvelope` must throw `ScriptV2DomainError('RECOMPUTE_LIMIT', ...)` for 21 targets and include assets/story context/visual style only when meaningful.

- [x] **Step 6: Add failing direct/outer result parser and stale writeback tests**

Cover direct JSON, `{ texts: ['{"shots":...}'], columns: [...] }`, assets-only result, missing prompt result, operation mismatch, fingerprint mismatch and a valid dual-track writeback.

- [x] **Step 7: Implement parser and conflict-safe writeback**

No late response may replace `user_edited` text. A matching operation with a changed input fingerprint writes the returned text but marks only that track `stale`.

- [x] **Step 8: Run and commit**

Run: `pnpm vitest run src/domain/__tests__/script-v2.test.ts`

```bash
git add src/domain/script-v2.ts src/domain/__tests__/script-v2.test.ts
git commit -m "feat: add script v2 migration and adapters"
```

### Task 3: Add runtime schemas and executable API examples

**Files:**
- Create: `src/contracts/script-v2.ts`
- Create: `src/contracts/__tests__/script-v2-examples.test.ts`
- Modify: `src/contracts/local.ts`
- Create: `docs/api/examples/script-v2-state.json`
- Create: `docs/api/examples/script-v2-quote.request.json`
- Create: `docs/api/examples/script-v2-quote.response.json`
- Create: `docs/api/examples/script-v2-run.request.json`
- Create: `docs/api/examples/script-v2-run.response.json`
- Create: `docs/api/examples/script-v2-official-recompute.sanitized.json`

**Interfaces:**
- Produces: `ScriptV2StateSchema` matching the domain type with `satisfies z.ZodType<ScriptV2State>`.
- Produces: `ScriptV2QuoteRequestSchema`, `ScriptV2QuoteResponseSchema`.
- Produces: `CreateScriptV2RunRequestSchema`, `ScriptV2RunSchema`, `ScriptV2RunResponseSchema`, `TransitionScriptV2RunRequestSchema`.
- Consumes: canonical domain constants and discriminants from Tasks 1–2.

- [x] **Step 1: Write failing schema tests for the persisted example**

Parse `script-v2-state.json`, assert two independent prompt tracks, all three asset buckets, stable ids, and rejection of duration 4, duration 16 and unknown shot sizes.

- [x] **Step 2: Implement strict nested schemas with bounded arrays and strings**

Use `.strict()` for API envelopes and `.passthrough()` only for the sanitized official evidence schema. Export inferred request/response types from Zod.

- [x] **Step 3: Add quote/run examples and failing discriminated-union tests**

Operations are exactly:

```ts
type ScriptV2Operation =
  | 'generate-full'
  | 'recognize-assets-only'
  | 'recompute-prompts'
  | 'generate-asset'
```

Each run result must be operation-specific; a prompt recompute result cannot carry an asset result.

- [x] **Step 4: Embed `ScriptV2StateSchema` in `NodeExtraSchema`**

Add `scriptV2: ScriptV2StateSchema.optional()` while retaining catchall compatibility for legacy extras.

- [x] **Step 5: Run examples and local contract suites**

Run: `pnpm vitest run src/contracts/__tests__/script-v2-examples.test.ts src/contracts/__tests__/canvas.test.ts`

Expected: PASS.

- [x] **Step 6: Commit Task 3**

```bash
git add src/contracts/script-v2.ts src/contracts/local.ts src/contracts/__tests__/script-v2-examples.test.ts docs/api/examples/script-v2-*.json
git commit -m "feat: add script v2 runtime contracts"
```

### Task 4: Build deterministic Script V2 mock operations

**Files:**
- Create: `src/domain/__tests__/script-v2-mock.test.ts`
- Create: `src/domain/script-v2-mock.ts`
- Modify: `src/domain/factory.ts`

**Interfaces:**
- Produces: `generateMockScriptV2(input): ScriptV2GenerateResult`.
- Produces: `recognizeMockScriptV2Assets(input): ScriptV2RecognizeAssetsResult`.
- Produces: `recomputeMockScriptV2Prompts(input): ScriptV2RecomputeResult`.
- Produces: `generateMockScriptV2Asset(input): ScriptV2GenerateAssetResult`.
- Produces: `createScriptV2BatchMutations(document, sourceNodeId, state, kind): ScriptV2BatchBuildResult`.
- Consumes: `createNode`, `createEdge`, `createGroup` and canonical Script V2 state.

- [ ] **Step 1: Write failing deterministic generation tests**

The same story + idempotency seed must return byte-equal four-shot output; a different seed may change ids but not vocabulary or invariants. Every row must have 5–15 second duration and both prompts.

- [ ] **Step 2: Implement four-beat local generation and asset recognition**

Use fixed Establish/Entrance/Turn/Resolve templates populated from normalized user text. Asset recognition preserves explicit `@name` mentions and stable first-appearance order.

- [ ] **Step 3: Add failing prompt-quality and recompute batching tests**

Assert each image prompt contains at least eight visual terms and 200–400 non-whitespace characters; each video prompt is at least 350 non-whitespace characters with at least three motion verbs and one temporal connector.

- [ ] **Step 4: Implement deterministic dual-track prompt generation**

Use source row fields and assets only; do not introduce remote facts. Return entity references that pass the local whitelist.

- [ ] **Step 5: Add failing batch graph topology tests**

For two shots, image mode must create one storyboard group, two Image nodes and two Script → Image edges. Video mode must create one normal group, two Video nodes, two edges, inherited durations and image/video track-specific prompts.

- [ ] **Step 6: Implement atomic batch mutation builder**

Use exact group names `分镜图生成器组` and `批量视频生成器组`; return `mutations`, `createdNodeIds`, `groupId` and `blockedReason`.

- [ ] **Step 7: Initialize Script nodes with `defaultScriptV2State(node.id)`**

Remove new writes of `{ phase, entry, shots, assets }` from `src/domain/factory.ts`.

- [ ] **Step 8: Run and commit**

Run: `pnpm vitest run src/domain/__tests__/script-v2-mock.test.ts src/domain/__tests__/script-v2.test.ts`

```bash
git add src/domain/script-v2-mock.ts src/domain/factory.ts src/domain/__tests__/script-v2-mock.test.ts
git commit -m "feat: add deterministic script v2 engine"
```

### Task 5: Implement Script V2 quote and run APIs

**Files:**
- Create: `src/server/script-v2.ts`
- Create: `src/server/__tests__/script-v2.test.ts`
- Create: `src/app/api/script-v2/quotes/route.ts`
- Create: `src/app/api/script-v2/runs/route.ts`
- Create: `src/app/api/script-v2/runs/[runId]/route.ts`
- Modify: `src/contracts/route-manifest.ts`

**Interfaces:**
- Produces: `quoteScriptV2(request): ScriptV2QuoteResponse`.
- Produces: `createScriptV2Run(request): ScriptV2Run`.
- Produces: `getScriptV2Run(runId): ScriptV2Run`.
- Produces: `transitionScriptV2Run(runId, action): ScriptV2Run`.
- Consumes: typed schemas and deterministic operations from Tasks 3–4.

- [ ] **Step 1: Write failing quote tests**

Lock costs: initial script 6, prompt recompute 6 per 20-shot batch, default Lib Image asset 18 per selected asset; assert identical requests return identical quote ids and quote expiry is based on the fixture clock.

- [ ] **Step 2: Implement quote calculation with no ledger mutation**

Quote response includes `credits`, `priceVersion: 'script-v2-local-1'`, breakdown and ISO expiry. It never reserves or settles credits.

- [ ] **Step 3: Write failing run lifecycle/idempotency tests**

Assert `queued → running → succeeded`, same `idempotencyKey` returns the same run, cancel is terminal, retry creates attempt 2 with the same logical run id, and malformed result cannot enter storage.

- [ ] **Step 4: Implement run repository and fixed poll progression**

Progress is 0 on create, 48 on first poll and 100 with result on second poll. Store only sanitized local input and operation-specific result. Export `__resetScriptV2Runs()` for tests and scenario reset.

- [ ] **Step 5: Implement Route Handlers using `parseJsonBody` and `handle`**

Return 404 for unknown run, 409 for transitions from an incompatible terminal state and 422 for contract failures.

- [ ] **Step 6: Register exact route manifest entries**

Add tag `Script V2` and operationIds `quoteScriptV2`, `createScriptV2Run`, `getScriptV2Run`, `transitionScriptV2Run` with observed UI triggers.

- [ ] **Step 7: Run server tests**

Run: `pnpm vitest run src/server/__tests__/script-v2.test.ts`

Expected: PASS. Route manifest registration moves to Task 12 with its matching OpenAPI paths, so no intermediate commit knowingly leaves the parity suite red.

- [ ] **Step 8: Commit Task 5 without weakening the OpenAPI parity assertion**

```bash
git add src/server/script-v2.ts src/server/__tests__/script-v2.test.ts src/app/api/script-v2
git commit -m "feat: add script v2 mock task api"
```

### Task 6: Add typed client methods and polling orchestration

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/api/__tests__/client.test.ts`
- Create: `src/components/script/useScriptV2Runs.ts`

**Interfaces:**
- Produces: `client.scriptV2.quote(input)`, `.createRun(input)`, `.getRun(runId)`, `.transitionRun(runId, action)`.
- Produces: `useScriptV2Runs({ nodeId, state, onStateChange })` with `generateScript`, `recognizeAssets`, `recomputePrompts`, `generateAssets`, `cancelRun`.
- Consumes: Script V2 API schemas and conflict-safe writeback.

- [ ] **Step 1: Add failing typed-client transport tests**

Assert URL encoding, exact JSON bodies, response decoding and `INVALID_DATA` for malformed quote/run responses.

- [ ] **Step 2: Implement typed endpoint group**

Validate inputs before transport and responses after transport, following the Jobs client pattern.

- [ ] **Step 3: Write a hook test for serial 20-shot batches with fake timers**

Use 21 rows and assert two runs are submitted in order, the second starts after the first succeeds, progress maps by row id, and stale writeback preserves a manual edit.

- [ ] **Step 4: Implement run orchestration with cancellation cleanup**

Use one active `AbortController`, 400ms local polling, exact operation ids, and flush pending prompt edits before starting recompute. No interval may survive unmount.

- [ ] **Step 5: Run and commit**

Run: `pnpm vitest run src/api/__tests__/client.test.ts src/components/script/__tests__/useScriptV2Runs.test.tsx`

```bash
git add src/api/client.ts src/api/__tests__/client.test.ts src/components/script/useScriptV2Runs.ts src/components/script/__tests__/useScriptV2Runs.test.tsx
git commit -m "feat: add typed script v2 client orchestration"
```

### Task 7: Reproduce the Script V2 canvas node and attached generator

**Files:**
- Create: `src/components/script/ScriptV2NodeEditor.tsx`
- Modify: `src/components/canvas/NodeCard.tsx`
- Modify: `src/components/canvas/WorkflowCanvas.tsx`
- Modify: `src/components/canvas/CanvasWorkspace.tsx`
- Create: `e2e/script-v2.spec.ts`

**Interfaces:**
- Produces: `ScriptV2NodeEditorProps { node, open, onOpenWorkspace, onStateChange, onMaterializeBatch }`.
- Consumes: canonical reader, typed run hook and canvas callbacks.

- [ ] **Step 1: Add failing Playwright test for three empty entry paths**

Create a Script V2 node and assert exact text/order:

```ts
await expect(node.getByRole('button')).toHaveText([
  '剧本生成分镜脚本',
  '角色生成分镜脚本',
  '自己编写分镜脚本',
])
```

- [ ] **Step 2: Implement V2 card independently from `scriptLegacy`**

Empty card shows three entries. Resource card shows completed first-stage check, numbered remaining stages, shot count and `打开脚本节点 →`.

- [ ] **Step 3: Add failing attached-generator/model-catalog tests**

Assert 660px counter-scaled panel at 25%, 50% and 100% canvas zoom; placeholder; model order; latency labels; translate toggle; quote 6; disabled submit on blank prompt; layered Escape.

- [ ] **Step 4: Implement generator and model catalog**

Use only Script-capable text entries (`gvlm-3.1`, `cvlm-5.5`, `gvlm-3.1-flash`). Submit via local Script run, persist returned state, then render resource mode.

- [ ] **Step 5: Implement the three entry transitions**

- screenplay opens attached generator;
- character opens generator with a character section and then persists a role asset;
- manual creates one blank 5s medium shot and opens the workspace immediately.

- [ ] **Step 6: Add and implement resource toolbar tests**

Assert visible actions `重新生成`, `批量生成分镜`, `批量生视频`, `下载`; disabled reasons follow domain gating; CSV uses UTF-8 BOM and quoted fields.

- [ ] **Step 7: Run focused browser tests and commit**

Run: `pnpm e2e e2e/script-v2.spec.ts --grep "node|generator" --reporter=line`

```bash
git add src/components/script/ScriptV2NodeEditor.tsx src/components/canvas/NodeCard.tsx src/components/canvas/WorkflowCanvas.tsx src/components/canvas/CanvasWorkspace.tsx e2e/script-v2.spec.ts
git commit -m "feat: reproduce script v2 canvas node"
```

### Task 8: Reproduce stage 1 shot confirmation workspace

**Files:**
- Create: `src/components/script/ScriptV2Workspace.tsx`
- Create: `src/components/script/ScriptV2ShotTable.tsx`
- Modify: `src/components/canvas/CanvasWorkspace.tsx`
- Modify: `e2e/script-v2.spec.ts`

**Interfaces:**
- Produces: full-screen `ScriptV2Workspace` over one canonical state.
- Produces: `ScriptV2ShotTable` callbacks for patch, append, move, color, delete and prompt detail.
- Consumes: `useEditor.commitWith` for serialized persisted edits.

- [ ] **Step 1: Add failing stage/header/table accessibility test**

Assert three stage buttons, dynamic subtitles, global `N/3`, close label, semantic header order and bottom `添加镜头`/current action.

- [ ] **Step 2: Implement full-screen shell and exact stage metrics**

Use fixed top and bottom chrome, horizontally scrollable table and theme-aware dark/light surfaces. Pressing Escape closes only when no child surface is open.

- [ ] **Step 3: Add failing duration/shot-size/editor tests**

Assert 5–15 clamping, helper copy, save button, all 12 shot sizes, text popover autosave on blur, and no save before blur.

- [ ] **Step 4: Implement cell editors with local drafts and commit queue**

Each popover snapshots the current row, commits only changed fields, and flushes on blur, Enter where appropriate, stage change and close.

- [ ] **Step 5: Add failing reorder/color/delete tests**

Drag row 1 below row 2 and assert stable ids with dense shot numbers; choose red then clear; delete with confirmation; reload and assert persistence.

- [ ] **Step 6: Implement row actions and one-mutation drag settlement**

Pointer move uses local visual order; pointer up sends one `updateNode` mutation carrying canonical state.

- [ ] **Step 7: Run and commit**

Run: `pnpm e2e e2e/script-v2.spec.ts --grep "stage 1|shot table" --reporter=line`

```bash
git add src/components/script/ScriptV2Workspace.tsx src/components/script/ScriptV2ShotTable.tsx src/components/canvas/CanvasWorkspace.tsx e2e/script-v2.spec.ts
git commit -m "feat: reproduce script v2 shot workspace"
```

### Task 9: Reproduce stage 2 asset lifecycle

**Files:**
- Create: `src/components/script/ScriptV2Assets.tsx`
- Create: `src/components/script/ScriptV2Dialogs.tsx`
- Modify: `src/components/script/ScriptV2Workspace.tsx`
- Modify: `e2e/script-v2.spec.ts`

**Interfaces:**
- Produces: grouped asset stage and source/AI/batch/delete dialogs.
- Consumes: local assets client, canvas node candidates, Image model catalog and Script run hook.

- [ ] **Step 1: Add failing grouped-asset/source-dialog test**

Assert `角色 / 场景 / 道具`, add action per section, immediate pending card, and exact source order `AI生成 / 从当前画布选择 / 本地上传 / 个人资产库`.

- [ ] **Step 2: Implement pending-first creation and source dialog**

Closing the source dialog leaves the pending card. `下一步` shows `0/1 已生成、还差 1 个` and remains disabled; direct stage 3 navigation remains possible.

- [ ] **Step 3: Add failing AI form and quote test**

Assert defaults `Lib Image / 标准 / 2K / 2:1 / 18`, model-dependent choices, prompt-required submit and generated ready preview.

- [ ] **Step 4: Implement AI, canvas, upload and library sources**

AI calls local Script run; canvas creates linkedNodeId; upload stores object URL metadata; library reads local `/api/assets`. All produce ready state without external network.

- [ ] **Step 5: Add failing asset card/menu/delete-impact tests**

Cover detail edit, choose image, AI generation, locate disabled/enabled, clear, save disabled/enabled, and both delete modes with prompt staleness.

- [ ] **Step 6: Implement card menu and reference reconciliation**

Renaming an asset reconciles visible mention refs by asset id; it never string-replaces unrelated words.

- [ ] **Step 7: Add and implement batch asset dialog test**

Assert per-role grouping, checkboxes, editable prompts, selected count, shared controls, aggregate credits and sequential success/failure summaries.

- [ ] **Step 8: Run and commit**

Run: `pnpm e2e e2e/script-v2.spec.ts --grep "asset" --reporter=line`

```bash
git add src/components/script/ScriptV2Assets.tsx src/components/script/ScriptV2Dialogs.tsx src/components/script/ScriptV2Workspace.tsx e2e/script-v2.spec.ts
git commit -m "feat: reproduce script v2 assets stage"
```

### Task 10: Reproduce stage 3 dual-track prompt workspace

**Files:**
- Create: `src/components/script/ScriptV2Prompts.tsx`
- Modify: `src/components/script/ScriptV2Dialogs.tsx`
- Modify: `src/components/script/ScriptV2Workspace.tsx`
- Modify: `e2e/script-v2.spec.ts`

**Interfaces:**
- Produces: per-shot `ScriptV2PromptDetailDialog` and `ScriptV2BatchPromptDialog`.
- Consumes: prompt reducer/fingerprints, typed run hook and 500ms debounced commit.

- [ ] **Step 1: Add failing single-shot prompt dialog test**

Assert title `第 1 镜：最终提示词`, two labeled tracks, independent status chips, smart/auto radio, smart-only model selector, quote, recompute and no outside-click close.

- [ ] **Step 2: Implement 500ms edit buffering and flush boundaries**

Use one timer per track. Closing, switching row, changing compose mode and recompute call `flushAll()` before any state transition.

- [ ] **Step 3: Add failing local compose/undo test**

Auto compose replaces eligible tracks, leaves empty inputs untouched, prompts before overwrite, and offers one 20-second undo that disappears after a conflicting edit.

- [ ] **Step 4: Implement deterministic auto compose and undo snapshot**

Keep undo state ephemeral but compare post-compose fingerprints before applying rollback.

- [ ] **Step 5: Add failing smart recompute/stale test**

Begin run, edit source row before completion, poll completion and assert returned prompts are marked stale without replacing the newer manual text. Assert generating and failed states have correct labels/actions.

- [ ] **Step 6: Implement conflict-safe smart recompute**

Persist operation contexts and batch run state so a reload can resume local polling or mark orphaned runs failed without leaving `generating` forever.

- [ ] **Step 7: Add failing batch dialog test**

Assert selection/all/partial state, details expansion, selected count, aggregate cost, mode/model controls, 21 rows split into 20 + 1, and serial progress summary.

- [ ] **Step 8: Implement batch modal and stage completion**

The top `合成提示词` subtitle counts a shot complete only when both image and video tracks are `synced` or `user_edited` with non-empty text.

- [ ] **Step 9: Run and commit**

Run: `pnpm e2e e2e/script-v2.spec.ts --grep "prompt" --reporter=line`

```bash
git add src/components/script/ScriptV2Prompts.tsx src/components/script/ScriptV2Dialogs.tsx src/components/script/ScriptV2Workspace.tsx e2e/script-v2.spec.ts
git commit -m "feat: reproduce script v2 prompt stage"
```

### Task 11: Materialize batch storyboards/videos and retire V2 legacy duplication

**Files:**
- Modify: `src/components/canvas/CanvasWorkspace.tsx`
- Modify: `src/components/script/ScriptV2NodeEditor.tsx`
- Modify: `src/components/script/ScriptV2Workspace.tsx`
- Modify: `src/components/script/ScriptWizard.tsx`
- Modify: `src/components/script/script-model.ts`
- Modify: `e2e/script-v2.spec.ts`

**Interfaces:**
- Consumes: `createScriptV2BatchMutations` from Task 4.
- Produces: V2 batch actions wired to existing canvas mutation, selection, fitView and ConfirmGate flow.
- Preserves: `LegacyScriptWizard` for `scriptLegacy` only.

- [ ] **Step 1: Add failing image/video batch confirmation tests**

Assert configuration modal, selected shots, invalid/missing prompt reasons, and no graph mutation before confirmation.

- [ ] **Step 2: Implement confirmed single-transaction materialization**

Commit returned mutations once, close Script workspace, select created ids and fitView. Image nodes use image prompts; Video nodes use video prompts and shot durations.

- [ ] **Step 3: Add failing undo/reload/ConfirmGate tests**

One undo removes group, nodes and edges; reload retains committed topology; running an output node opens existing quote confirmation rather than bypassing it.

- [ ] **Step 4: Split legacy/V2 UI paths**

Export current simplified wizard as `LegacyScriptWizard`; remove all Script V2 reads/writes of `extra.draft` and `extra.shots`; keep migration reader tests proving old V2 documents still open.

- [ ] **Step 5: Run all Script-focused tests**

Run: `pnpm vitest run src/domain/__tests__/script-v2.test.ts src/domain/__tests__/script-v2-mock.test.ts src/contracts/__tests__/script-v2-examples.test.ts src/server/__tests__/script-v2.test.ts`

Run: `pnpm e2e e2e/script-v2.spec.ts --reporter=line`

- [ ] **Step 6: Commit Task 11**

```bash
git add src/components/canvas/CanvasWorkspace.tsx src/components/script src/domain/script-v2.ts src/domain/script-v2-mock.ts e2e/script-v2.spec.ts
git commit -m "feat: complete script v2 batch workflows"
```

### Task 12: Publish API/research documentation and OpenAPI

**Files:**
- Create: `docs/research/libtv/api/captures/2026-09-03-script-v2.md`
- Create: `docs/api/SCRIPT_V2_STATE.md`
- Modify: `docs/research/libtv/pages/canvas/README.md`
- Modify: `docs/research/libtv/api/ENDPOINTS.md`
- Modify: `docs/api/README.md`
- Modify: `docs/api/openapi.yaml`
- Modify: `src/contracts/__tests__/openapi.test.ts`
- Modify: `src/contracts/route-manifest.ts`

**Interfaces:**
- Documents all state fields, UI triggers, request/response schemas, idempotency, revision behavior, mock progression and official-to-local mapping.
- Makes all route manifest entries discoverable under OpenAPI tags and operationIds.

- [ ] **Step 1: Write sanitized official evidence note**

Record observed UI, shape-confirmed `/api/canvas/nodes/batch`, power calculator envelopes, `script-generate-v2`, `script-recompute-prompts-v2`, result parser shapes, 20/100 limits and evidence grades. Replace every concrete remote identifier with `PROJECT_ID`, `NODE_ID`, `REQUEST_ID`, `TRACE_ID` or `ASSET_ID`.

- [ ] **Step 2: Write the backend handoff guide**

`SCRIPT_V2_STATE.md` must include state diagram, prompt state table, asset state table, stage gates, batch rules, idempotency, stale writeback, error codes, CSV behavior and endpoint-to-UI matrix.

- [ ] **Step 3: Add OpenAPI 3.1 components and four operations**

Add schemas matching `src/contracts/script-v2.ts`, examples by `$ref`, 200/400/404/409/422 responses, and increment info version to `1.9.0-script-v2`.

- [ ] **Step 4: Register routes and extend OpenAPI parity tests**

Add tag `Script V2` and operationIds `quoteScriptV2`, `createScriptV2Run`, `getScriptV2Run`, `transitionScriptV2Run` to `LOCAL_API_ROUTES`. Assert every Script V2 route manifest operation is present once and all six JSON examples validate against runtime schemas.

- [ ] **Step 5: Scan documentation for secret-shaped values**

Run:

```bash
rg -n 'Cookie:|Authorization:|Bearer |access[_-]?token|refresh[_-]?token|spaceId=[0-9]|projectId=[0-9a-f]{20,}|trace_id"\s*:\s*"[0-9a-f-]{12,}' docs src e2e
```

Expected: no Script V2 capture contains credential values or official concrete identifiers.

- [ ] **Step 6: Run contract suites and commit**

Run: `pnpm vitest run src/contracts/__tests__/openapi.test.ts src/contracts/__tests__/script-v2-examples.test.ts`

```bash
git add docs/api docs/research/libtv src/contracts/__tests__/openapi.test.ts
git commit -m "docs: publish script v2 api contract"
```

### Task 13: Capture visual baselines and complete quality gates

**Files:**
- Modify: `e2e/script-v2.spec.ts`
- Create: `e2e/__snapshots__/script-v2.spec.ts-snapshots/*.png`
- Create: `docs/visual/script-v2-comparison.md`
- Modify: this plan to check completed steps.

**Interfaces:**
- Produces: reproducible 1440×900 evidence and final milestone verification log.

- [ ] **Step 1: Add twelve named visual assertions**

Capture node empty, generator, model catalog, shots, shot-size menu, assets, source dialog, AI asset, prompts, single prompt, batch prompt and batch video confirm states. Mask only deterministic cursor/caret regions.

- [ ] **Step 2: Run Script V2 screenshots with an explicit update**

Run: `pnpm e2e e2e/script-v2.spec.ts --update-snapshots --reporter=line`

Review every changed image and retain only Script V2 snapshots.

- [ ] **Step 3: Write visual comparison notes**

For each baseline, cite the matching official screenshot, list matched geometry/copy/states and document only intentional local differences: offline generated media, local ids, no real credit spend and no remote account data.

- [ ] **Step 4: Run full static and unit gates**

Run: `pnpm verify`

Expected: typecheck, lint, all Vitest suites and production build PASS.

- [ ] **Step 5: Run the complete browser suite**

Run: `pnpm e2e --reporter=line`

Expected: all non-platform-skipped tests PASS, including existing Text/Image/Audio/Video/Canvas regressions.

- [ ] **Step 6: Restore generated and unrelated files**

```bash
git restore -- next-env.d.ts
git status --short
```

Restore any screenshot outside `e2e/__snapshots__/script-v2.spec.ts-snapshots/`. Leave `.gitignore` untracked.

- [ ] **Step 7: Run final integrity checks**

```bash
git diff --check
git grep -nE 'Cookie:|Authorization:|Bearer |access[_-]?token|refresh[_-]?token' -- ':!pnpm-lock.yaml'
```

Expected: no whitespace errors and no persisted credentials.

- [ ] **Step 8: Commit the verified milestone**

```bash
git add e2e/script-v2.spec.ts e2e/__snapshots__/script-v2.spec.ts-snapshots docs/visual/script-v2-comparison.md docs/superpowers/plans/2026-09-03-script-v2-parity.md
git commit -m "test: verify script v2 parity"
```

## Self-Review

- Spec coverage: node generator, all three stages, asset sources/lifecycle, dual prompt tracks, async stale protection, batch graph creation, CSV, APIs, docs, accessibility, visual comparison and full regressions each map to a task.
- Placeholder scan: the plan contains no deferred implementation marker; all file names, operations, labels, limits and test commands are concrete.
- Type consistency: `ScriptV2State` is defined once in Task 1, validated by `ScriptV2StateSchema` in Task 3, consumed by mock/API/UI tasks, and persisted only under `extra.scriptV2`.
- Scope split: this plan covers Script V2 only. Legacy Script, frame analysis, Director Studio and later global surfaces remain separate milestones under the active repository-wide goal.

## Execution Choice

The user has already selected continuous autonomous work in this task and asked to be contacted only for official login/re-authentication. Execute inline with `superpowers:executing-plans`, preserve test-first checkpoints, and keep the repository-wide goal active after this Script V2 milestone.
