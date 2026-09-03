# LibTV Contract and Deterministic Scenario Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the typed contract, deterministic scenario, mock transport, and OpenAPI foundation that every LibTV-replica surface can share without importing fixtures directly.

**Architecture:** Keep the existing domain model as the editable source of truth, but put a strict transport boundary in front of it. Zod schemas decode observed LibTV envelopes into normalized local contracts; a deterministic scenario catalogue seeds the file-backed mock repository; a route manifest and OpenAPI 3.1 document describe the same local API surface and are checked together in tests.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9 strict mode, Zod 3, Vitest 3, Playwright 1.56, OpenAPI 3.1, pnpm.

## Global Constraints

- LibTV 官网公开态、登录态 UI 和网络行为是产品事实的第一优先级来源。
- 当前仓库是纯前端子仓库；不连接真实认证、数据库、支付、模型、GPU、对象存储或 ComfyUI。
- 所有 API、任务、素材和业务数据必须可由确定性本地 mock/fixture 重放。
- 页面组件不直接 import fixture；业务组件不直接调用裸 `fetch`。
- 官网认证值、用户标识、项目标识、原始提示词和远程媒体 URL不得写入源码、fixture、日志或文档。
- 正式验收视口固定为 Chrome `1440x900` CSS 像素，`deviceScaleFactor: 2`，`locale: zh-CN`。
- 每个生产行为遵循测试先行：先观察失败，再写最小实现，再跑全量相关测试。
- 不引入新的运行时依赖；OpenAPI 文件采用 JSON-compatible YAML，测试使用仓库内纯 TypeScript 结构检查。
- 不提交用户现有的未跟踪 `.gitignore`。

---

## File Map

### New contract files

- `src/contracts/http.ts` — shared success/error envelope schemas and normalized contract errors.
- `src/contracts/project.ts` — project/folder list request, response and normalized card contracts.
- `src/contracts/canvas.ts` — canvas bootstrap, permissions, node record and connection schemas.
- `src/contracts/scenario.ts` — public scenario IDs and scenario metadata schemas.
- `src/contracts/route-manifest.ts` — authoritative local mock method/path/tag/scenario inventory.
- `src/contracts/__tests__/*.test.ts` — schema, normalization and manifest/OpenAPI drift tests.

### New mock files

- `src/mocks/clock.ts` — fixed clock and deterministic timestamp helpers.
- `src/mocks/scenarios/catalog.ts` — scenario metadata and stable IDs.
- `src/mocks/scenarios/build.ts` — converts one scenario ID into a complete `WorkspaceState`.
- `src/mocks/scenarios/video-project.ts` — populated video workflow fixture shared by video states.
- `src/mocks/__tests__/scenarios.test.ts` — determinism and referential-integrity tests.

### New API/client files

- `src/api/client.ts` — injectable JSON transport plus typed project/canvas/scenario methods.
- `src/api/__tests__/client.test.ts` — successful decode and malformed/error response tests.
- `src/app/api/dev/scenario/route.ts` — development-only scenario read/switch endpoint.
- `src/app/api/dev/scenario/route.test.ts` — production guard and request validation tests.

### Modified files

- `src/server/store.ts` — seed/reset through the deterministic scenario builder.
- `src/app/api/dev/reset/route.ts` — reset the active scenario rather than a separate ad-hoc seed.
- `src/lib/api.ts` — compatibility re-export over the typed transport during staged migration.
- `docs/api/openapi.yaml` — OpenAPI 3.1 source for every current local mock route.
- `docs/api/README.md` — contract conventions and UI-to-endpoint index.
- `docs/api/ERRORS.md` — normalized error code/status rules.
- `docs/api/JOB_STATES.md` — deterministic job state machine and scenario triggers.
- `docs/api/WORKFLOW_CONCURRENCY.md` — revision, conflict, heartbeat and retry rules.
- `docs/api/examples/*.json` — sanitized requests/responses used by docs and tests.
- `e2e/workflow.spec.ts` — reset by explicit scenario and prove repeatability.

---

### Task 1: Shared HTTP Contract Boundary

**Files:**
- Create: `src/contracts/http.ts`
- Create: `src/contracts/__tests__/http.test.ts`

**Interfaces:**
- Produces: `ExternalEnvelopeSchema`, `LocalErrorEnvelopeSchema`, `ContractDecodeError`, `decodeExternalEnvelope<T>()`.
- Consumes: `z.ZodType<T>` from Zod.

- [x] **Step 1: Write the failing envelope tests**

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ContractDecodeError, decodeExternalEnvelope } from '@/contracts/http'

const Payload = z.object({ total: z.number().int().nonnegative() })

describe('decodeExternalEnvelope', () => {
  it('accepts LibTV msg and Agent message envelope variants', () => {
    expect(decodeExternalEnvelope({ code: 0, data: { total: 2 }, msg: 'ok' }, Payload)).toEqual({ total: 2 })
    expect(decodeExternalEnvelope({ code: 0, data: { total: 3 }, message: 'ok' }, Payload)).toEqual({ total: 3 })
    expect(decodeExternalEnvelope({ code: 0, data: { total: 4 }, msg: null }, Payload)).toEqual({ total: 4 })
  })

  it('rejects a non-zero business code with a stable normalized error', () => {
    expect(() => decodeExternalEnvelope({ code: 4001, data: null, msg: '会话已过期' }, Payload)).toThrowError(
      expect.objectContaining({ name: 'ContractDecodeError', code: 'EXTERNAL_BUSINESS_ERROR', message: '会话已过期' }),
    )
  })

  it('rejects malformed successful data instead of leaking unknown into UI state', () => {
    expect(() => decodeExternalEnvelope({ code: 0, data: { total: '2' }, msg: '' }, Payload)).toThrow(ContractDecodeError)
  })
})
```

- [x] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run src/contracts/__tests__/http.test.ts`

Expected: FAIL because `@/contracts/http` does not exist.

- [x] **Step 3: Implement the minimal decoder**

```ts
import { z } from 'zod'

export const ExternalEnvelopeSchema = z.object({
  code: z.number(),
  data: z.unknown(),
  msg: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  trace_id: z.string().optional(),
}).passthrough()

export const LocalErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
  requestId: z.string(),
})

export class ContractDecodeError extends Error {
  constructor(
    public readonly code: 'INVALID_ENVELOPE' | 'EXTERNAL_BUSINESS_ERROR' | 'INVALID_DATA',
    message: string,
    public readonly issues: unknown = null,
  ) {
    super(message)
    this.name = 'ContractDecodeError'
  }
}

export function decodeExternalEnvelope<T>(input: unknown, schema: z.ZodType<T>): T {
  const envelope = ExternalEnvelopeSchema.safeParse(input)
  if (!envelope.success) throw new ContractDecodeError('INVALID_ENVELOPE', '响应 envelope 不合法', envelope.error.issues)
  if (envelope.data.code !== 0) {
    throw new ContractDecodeError(
      'EXTERNAL_BUSINESS_ERROR',
      envelope.data.msg ?? envelope.data.message ?? `业务错误 ${envelope.data.code}`,
    )
  }
  const data = schema.safeParse(envelope.data.data)
  if (!data.success) throw new ContractDecodeError('INVALID_DATA', '响应 data 不合法', data.error.issues)
  return data.data
}
```

- [x] **Step 4: Run focused and full contract tests**

Run: `pnpm vitest run src/contracts/__tests__/http.test.ts`

Expected: 3 tests PASS.

- [x] **Step 5: Commit the contract primitive**

```bash
git add src/contracts/http.ts src/contracts/__tests__/http.test.ts
git commit -m "feat: add strict external API envelope decoder"
```

### Task 2: Project List and Canvas Bootstrap Schemas

**Files:**
- Create: `src/contracts/project.ts`
- Create: `src/contracts/canvas.ts`
- Create: `src/contracts/__tests__/project.test.ts`
- Create: `src/contracts/__tests__/canvas.test.ts`
- Create: `docs/api/examples/project-list.request.json`
- Create: `docs/api/examples/project-list.response.json`
- Create: `docs/api/examples/canvas-bootstrap.response.json`

**Interfaces:**
- Consumes: `decodeExternalEnvelope()` from Task 1.
- Produces: `ProjectListRequestSchema`, `ProjectEntrySchema`, `ProjectListPage`, `decodeProjectList()`, `CanvasBootstrapSchema`, `CanvasBootstrap`, `decodeCanvasBootstrap()`.

- [x] **Step 1: Add sanitized examples copied from the confirmed field shapes**

`project-list.request.json`:

```json
{"id":0,"spaceTypes":[1,10],"page":1,"pageSize":20,"orderBy":"created_at_desc","onlyFolder":false}
```

`project-list.response.json` uses deterministic IDs `folder_demo` and `project_video_demo`, includes one folder and one project, and retains the external `{code,data:{folders,total},msg,trace_id}` envelope.

`canvas-bootstrap.response.json` uses `project_video_demo`, one image node, one video node, one connection and permissions with all six booleans.

- [x] **Step 2: Write failing normalization tests**

```ts
it('normalizes mixed folder/project entries without exposing external numeric enums', () => {
  const result = decodeProjectList(example)
  expect(result.items.map((item) => item.kind)).toEqual(['folder', 'project'])
  expect(result).toMatchObject({ page: 1, pageSize: 20, total: 2, hasMore: false })
})

it('parses node data JSON and keeps permission booleans explicit', () => {
  const result = decodeCanvasBootstrap(example)
  expect(result.permissions).toEqual({ read: true, edit: true, manage: true, publish: true, share: true, copy: true })
  expect(result.nodes[1]).toMatchObject({ id: 'node_video_01', kind: 'video', data: { generatorType: 'video' } })
  expect(result.connections[0]).toMatchObject({ source: 'node_image_01', target: 'node_video_01' })
})
```

- [x] **Step 3: Run both tests and verify RED**

Run: `pnpm vitest run src/contracts/__tests__/project.test.ts src/contracts/__tests__/canvas.test.ts`

Expected: FAIL because project/canvas decoders do not exist.

- [x] **Step 4: Implement strict external schemas and explicit normalizers**

The normalized project card must be:

```ts
export type ProjectListItem = {
  id: string
  kind: 'folder' | 'project'
  name: string
  description: string
  coverUrl: string | null
  childCount: number
  createdAt: string
  updatedAt: string
}
```

The canvas decoder must parse every node `data` string with `JSON.parse`, reject non-object JSON with
`ContractDecodeError('INVALID_DATA', ...)`, map external node types `1/2/3` to `effect/image/video`, and
preserve an `externalType: number` field for unrecognized types instead of silently dropping them.

- [x] **Step 5: Run focused tests and full typecheck**

Run: `pnpm vitest run src/contracts/__tests__/project.test.ts src/contracts/__tests__/canvas.test.ts && pnpm typecheck`

Expected: all focused tests PASS; typecheck exits 0.

- [x] **Step 6: Commit observed API schemas**

```bash
git add src/contracts docs/api/examples
git commit -m "feat: encode observed project and canvas contracts"
```

### Task 3: Deterministic Scenario Catalogue

**Files:**
- Create: `src/contracts/scenario.ts`
- Create: `src/mocks/clock.ts`
- Create: `src/mocks/scenarios/catalog.ts`
- Create: `src/mocks/scenarios/video-project.ts`
- Create: `src/mocks/scenarios/build.ts`
- Create: `src/mocks/__tests__/scenarios.test.ts`

**Interfaces:**
- Produces: `ScenarioId`, `ScenarioMeta`, `SCENARIO_CATALOG`, `DEFAULT_SCENARIO_ID`, `buildScenario(id): WorkspaceState`, `FIXED_NOW`.
- Consumes: domain factories/types and `WorkspaceState` from `src/server/store.ts`.

- [x] **Step 1: Write failing determinism and integrity tests**

```ts
const REQUIRED = [
  'anonymous',
  'authenticated-populated',
  'session-expired',
  'video-running',
  'video-succeeded',
  'video-failed',
  'video-cancelled',
  'video-compliance-blocked',
  'revision-conflict',
  'public-showcase',
] as const

it('builds every required scenario byte-for-byte deterministically', () => {
  for (const id of REQUIRED) expect(buildScenario(id)).toEqual(buildScenario(id))
})

it('keeps every project/canvas/node/job/artifact reference valid', () => {
  for (const id of REQUIRED) expect(validateScenarioReferences(buildScenario(id))).toEqual([])
})

it('represents every terminal video status with the same project topology', () => {
  const states = ['video-succeeded', 'video-failed', 'video-cancelled', 'video-compliance-blocked'] as const
  expect(states.map((id) => buildScenario(id).projects[0].id)).toEqual(states.map(() => 'prj_video_demo'))
})
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/mocks/__tests__/scenarios.test.ts`

Expected: FAIL because scenario modules do not exist.

- [x] **Step 3: Implement the fixed clock and catalogue**

Use `FIXED_NOW = '2026-09-03T12:00:00.000Z'`. Every ID is a readable constant such as
`prj_video_demo`, `can_video_main`, `node_video_01`, `job_video_01`, and every timestamp derives from
`FIXED_NOW` through `isoAt(offsetSeconds)`.

- [x] **Step 4: Implement one canonical video project and status overlays**

`buildVideoProject(status)` creates the same text → image → video topology for every video state.
Status overlays change only `GenerationJob.status`, `progress`, `error`, `finishedAt`, artifacts and the
node's `jobId/artifacts`; they do not change project, canvas, node or edge IDs.

- [x] **Step 5: Implement the remaining viewer/session/conflict/showcase scenarios**

Each scenario fills every required `WorkspaceState` collection. Empty collections are explicit empty
arrays; balances always match the last ledger entry; anonymous uses no private projects but retains public
snapshot fixture data through the existing publish store boundary.

- [x] **Step 6: Run focused tests and the existing 454-test suite**

Run: `pnpm vitest run src/mocks/__tests__/scenarios.test.ts && pnpm test`

Expected: scenario tests PASS and no existing test regresses.

- [x] **Step 7: Commit deterministic scenarios**

```bash
git add src/contracts/scenario.ts src/mocks
git commit -m "feat: add deterministic LibTV mock scenarios"
```

### Task 4: Scenario-backed Store and Development API

**Files:**
- Modify: `src/server/store.ts`
- Modify: `src/app/api/dev/reset/route.ts`
- Create: `src/app/api/dev/scenario/route.ts`
- Create: `src/app/api/dev/scenario/route.test.ts`
- Create: `src/server/__tests__/scenario-store.test.ts`

**Interfaces:**
- Consumes: `buildScenario()`, `ScenarioIdSchema`, `DEFAULT_SCENARIO_ID` from Task 3.
- Produces: `activeScenarioId()`, `resetStore(scenarioId?)`, `GET/POST /api/dev/scenario`.

- [x] **Step 1: Write failing store tests**

```ts
it('resets to an explicitly selected deterministic scenario', async () => {
  const first = await resetStore('video-failed')
  invalidateCache()
  const second = await readState()
  expect(second).toEqual(first)
  expect(second.jobs[0]).toMatchObject({ id: 'job_video_01', status: 'failed' })
})

it('plain reset restores the active scenario rather than changing fixtures', async () => {
  await resetStore('video-running')
  await withState((state) => state.projects.splice(0))
  expect((await resetStore()).projects[0].id).toBe('prj_video_demo')
})
```

- [x] **Step 2: Write failing route tests**

Call the exported route functions directly. Assert `POST {scenarioId:'video-succeeded'}` returns status
200 and metadata, invalid IDs return 400, and both GET/POST return 403 when `NODE_ENV` is production.

- [x] **Step 3: Run and verify RED**

Run: `pnpm vitest run src/server/__tests__/scenario-store.test.ts src/app/api/dev/scenario/route.test.ts`

Expected: FAIL because store/API signatures do not exist.

- [x] **Step 4: Replace ad-hoc seeding with scenario seeding**

Persist active scenario metadata in `.data/scenario.json`; `workspace.json` remains only business state.
`resetStore(undefined)` reads the active scenario, while `resetStore(id)` validates and atomically updates
both files. `NODE_ENV=production` never exposes scenario mutation.

- [x] **Step 5: Implement GET/POST scenario route and update reset route**

Responses:

```ts
type ScenarioResponse = {
  scenario: ScenarioMeta
  state: { projects: number; canvases: number; jobs: number; assets: number }
}
```

`POST /api/dev/reset` calls `resetStore()` without changing the active scenario.

- [x] **Step 6: Run focused tests and all server tests**

Run: `pnpm vitest run src/server src/app/api/dev/scenario/route.test.ts`

Expected: all server and route tests PASS.

- [x] **Step 7: Commit scenario switching**

```bash
git add src/server/store.ts src/app/api/dev src/server/__tests__/scenario-store.test.ts
git commit -m "feat: switch mock workspace by deterministic scenario"
```

### Task 5: Injectable Typed API Client

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/__tests__/client.test.ts`
- Modify: `src/lib/api.ts`

**Interfaces:**
- Consumes: project/canvas/scenario schemas from Tasks 1–3.
- Produces: `createApiClient(transport?)`, singleton `client`, compatibility `api` methods.

- [x] **Step 1: Write failing transport tests with a real Response object**

```ts
const transport: typeof fetch = async () => Response.json({ projects: [], folders: [], balance: 20 })
const client = createApiClient(transport)
expect(await client.projects.list()).toEqual({ projects: [], folders: [], balance: 20 })

const broken: typeof fetch = async () => Response.json({ projects: 'not-an-array' })
await expect(createApiClient(broken).projects.list()).rejects.toMatchObject({ code: 'INVALID_DATA' })
```

Also assert HTTP 409 maps to `ApiError {status:409, code:'REVISION_CONFLICT'}` and malformed JSON maps to
`ApiError {status:502, code:'INVALID_JSON'}`.

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/api/__tests__/client.test.ts`

Expected: FAIL because `createApiClient` does not exist.

- [x] **Step 3: Implement one request pipeline and typed endpoint groups**

```ts
export type JsonTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function createApiClient(transport: JsonTransport = fetch) {
  return {
    projects: {
      list: () => request(ProjectListLocalResponseSchema, '/api/projects'),
      create: (input: CreateProjectInput) => request(CreateProjectResponseSchema, '/api/projects', json('POST', input)),
    },
    canvas: { bootstrap: (id: string) => request(CanvasDetailLocalResponseSchema, `/api/canvases/${id}`) },
    scenarios: {
      get: () => request(ScenarioResponseSchema, '/api/dev/scenario'),
      set: (scenarioId: ScenarioId) => request(ScenarioResponseSchema, '/api/dev/scenario', json('POST', { scenarioId })),
    },
    raw: { get, post, patch, put, del },
  }
}
```

All endpoint groups share one JSON parser, HTTP error mapper and Zod decode path. `src/lib/api.ts` exports
`client.raw` as `api` so unchanged components continue to compile while later plans migrate by surface.

- [x] **Step 4: Run tests, typecheck and lint**

Run: `pnpm vitest run src/api/__tests__/client.test.ts && pnpm typecheck && pnpm lint`

Expected: all commands exit 0.

- [x] **Step 5: Commit the API client boundary**

```bash
git add src/api src/lib/api.ts
git commit -m "feat: add injectable typed API client"
```

### Task 6: Route Manifest and OpenAPI 3.1 Contract

**Files:**
- Create: `src/contracts/route-manifest.ts`
- Create: `src/contracts/__tests__/openapi.test.ts`
- Create: `docs/api/openapi.yaml`
- Create: `docs/api/README.md`
- Create: `docs/api/ERRORS.md`
- Create: `docs/api/JOB_STATES.md`
- Create: `docs/api/WORKFLOW_CONCURRENCY.md`

**Interfaces:**
- Consumes: all current files under `src/app/api/**/route.ts` and scenario IDs from Task 3.
- Produces: `LOCAL_API_ROUTES`, OpenAPI paths/tags/components, UI-to-endpoint documentation.

- [x] **Step 1: Write a failing route/OpenAPI drift test**

The test recursively enumerates `src/app/api/**/route.ts`, reads exported HTTP method names with a strict
regex, converts `[projectId]` and `[...path]` to `{projectId}` and `{path}`, then checks that every pair is
present in both `LOCAL_API_ROUTES` and `docs/api/openapi.yaml`. It also verifies that each manifest entry
contains at least one scenario ID and one UI trigger string.

```ts
expect(openApiText).toContain('openapi: 3.1.0')
expect(openApiPairs).toEqual(manifestPairs)
expect(sourcePairs).toEqual(manifestPairs)
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/contracts/__tests__/openapi.test.ts`

Expected: FAIL because manifest and OpenAPI files do not exist.

- [x] **Step 3: Add every current route to the manifest**

Each item has this exact shape:

```ts
type LocalApiRoute = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  tag: 'Projects' | 'Folders' | 'Canvases' | 'Workflow' | 'Jobs' | 'Video' | 'Assets' | 'Agent' | 'Skills' | 'Publish' | 'Ledger' | 'Presence' | 'Development'
  operationId: string
  uiTriggers: readonly string[]
  scenarios: readonly ScenarioId[]
}
```

Include all existing routes plus `/api/dev/scenario`; no route is excluded as “internal.”

- [x] **Step 4: Write JSON-compatible OpenAPI YAML**

Use a YAML document whose values avoid anchors, merge keys and custom tags so the drift test can inspect
paths with deterministic text parsing. Every operation includes `operationId`, tag, success response,
`400`, `404`, `409`, `422` or `500` where applicable, and `x-ui-triggers`/`x-mock-scenarios` extensions.

- [x] **Step 5: Write the four contract guides**

- `README.md`: envelope, pagination, IDs, timestamps, idempotency, fixture selection, and UI-to-route table.
- `ERRORS.md`: `INVALID_INPUT`, `NOT_FOUND`, `REVISION_CONFLICT`, `QUOTE_EXPIRED`, `INSUFFICIENT_CREDITS`, `COMPLIANCE_BLOCKED`, `SESSION_EXPIRED`, `INVALID_DATA`.
- `JOB_STATES.md`: exact draft → confirmation → queued → running → terminal transition table and scenario names.
- `WORKFLOW_CONCURRENCY.md`: expected revision, 409 payload, single rebase retry, heartbeat, session expiry and refresh recovery.

- [x] **Step 6: Run drift test and full verification**

Run: `pnpm vitest run src/contracts/__tests__/openapi.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build`

Expected: manifest/source/OpenAPI pairs match; all commands exit 0.

- [ ] **Step 7: Commit API documentation**

```bash
git add src/contracts/route-manifest.ts src/contracts/__tests__/openapi.test.ts docs/api
git commit -m "docs: publish mock API OpenAPI contract"
```

### Task 7: Scenario-driven E2E Baseline

**Files:**
- Modify: `e2e/workflow.spec.ts`
- Create: `e2e/scenarios.spec.ts`

**Interfaces:**
- Consumes: `POST /api/dev/scenario`, `POST /api/dev/reset` and existing UI test IDs.
- Produces: `useScenario(request, id)` E2E helper and deterministic smoke coverage for five visible states.

- [ ] **Step 1: Write the failing scenario E2E helper and tests**

```ts
async function useScenario(request: APIRequestContext, scenarioId: string) {
  const selected = await request.post('/api/dev/scenario', { data: { scenarioId } })
  expect(selected.ok()).toBe(true)
  const reset = await request.post('/api/dev/reset')
  expect(reset.ok()).toBe(true)
}

test('video running is stable across refresh', async ({ page, request }) => {
  await useScenario(request, 'video-running')
  await page.goto('/canvas?projectId=prj_video_demo&canvasId=can_video_main')
  await expect(page.getByText('生成中')).toBeVisible()
  await page.reload()
  await expect(page.getByText('生成中')).toBeVisible()
})
```

Add equivalent smoke assertions for `video-succeeded`, `video-failed`, `video-compliance-blocked`, and
`session-expired`. Existing tests switch to `authenticated-populated` in `beforeEach`.

- [ ] **Step 2: Run the new file and verify RED**

Run: `pnpm playwright test e2e/scenarios.spec.ts`

Expected: at least one state assertion FAIL because current UI does not yet expose every scenario state.

- [ ] **Step 3: Add only the minimal existing-surface state labels needed for the baseline**

Use the existing canvas job rendering path; do not build the full video panel in this foundation plan.
The exact visible labels are `等待确认`, `排队中`, `生成中`, `生成完成`, `生成失败`, `已取消`,
`素材合规校验未通过`, and `会话已过期，请刷新页面`.

- [ ] **Step 4: Run the scenario file and complete suite**

Run: `pnpm playwright test e2e/scenarios.spec.ts && pnpm e2e`

Expected: scenario tests PASS and existing workflow E2E stays green.

- [ ] **Step 5: Run the batch completion gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e`

Expected: every command exits 0 with no skipped foundation scenario.

- [ ] **Step 6: Commit the E2E baseline**

```bash
git add e2e
git commit -m "test: cover deterministic LibTV mock scenarios"
```

---

## Self-review

- Spec coverage: this plan covers the contract/client/scenario/OpenAPI foundation only; global navigation,
  project visual parity, Workflow controls, storyboard, Video editor, Agent, Skill, assets, TV Show,
  account and final visual-diff work intentionally remain separate independently testable plans.
- Placeholder scan: there are no `TBD`, `TODO`, “similar to,” or undefined implementation slots; every
  new interface and scenario ID is named in this plan.
- Type consistency: `ScenarioId`, `ScenarioMeta`, `buildScenario`, `createApiClient`,
  `decodeExternalEnvelope`, `LOCAL_API_ROUTES` and route paths use the same names in producer and consumer
  tasks.
- Completion boundary: finishing this plan proves the shared foundation, not the full LibTV replica goal.
