import type { z, ZodType } from 'zod'

import { AccountProfileResponseSchema } from '@/contracts/account'
import { SharedAssetsResponseSchema, TeamResponseSchema } from '@/contracts/team'
import { HomeDiscoveryResponseSchema } from '@/contracts/home'
import { LedgerViewProjectionSchema } from '@/contracts/ledger'
import { ModelCatalogResponseSchema } from '@/contracts/models'
import {
  ListRecycleBinResponseSchema,
  PermanentlyDeleteRecycledProjectResponseSchema,
  RestoreRecycledProjectResponseSchema,
} from '@/contracts/recycle-bin'
import {
  GetMaterialResponseSchema,
  MaterialCatalogResponseSchema,
  ToggleMaterialFavouriteRequestSchema,
  ToggleMaterialFavouriteResponseSchema,
  type MaterialKind,
  type MaterialScope,
} from '@/contracts/materials'
import {
  GetPublishedSnapshotResponseSchema,
  ListPublishedSnapshotsResponseSchema,
  PublishCanvasResponseSchema,
  PublishRequestSchema,
  RevokePublishedSnapshotResponseSchema,
} from '@/contracts/publish'
import {
  CreateJobRequestSchema,
  CreateJobResponseSchema,
  GetJobResponseSchema,
  ListJobsResponseSchema,
  TransitionJobRequestSchema,
  TransitionJobResponseSchema,
  type TransitionJobAction,
} from '@/contracts/jobs'
import {
  CanvasDetailLocalResponseSchema,
  CreateProjectInputSchema,
  CreateProjectResponseSchema,
  MutationRequestSchema,
  MutationResultSchema,
  ProjectListLocalResponseSchema,
  ScenarioResponseSchema,
} from '@/contracts/local'
import {
  PresenceHeartbeatRequestSchema,
  PresenceHeartbeatResponseSchema,
  PresenceLeaseRequestSchema,
  PresenceLeaseResponseSchema,
} from '@/contracts/presence'
import type { ScenarioId } from '@/contracts/scenario'
import {
  CreateScriptV2RunRequestSchema,
  ScriptV2QuoteRequestSchema,
  ScriptV2QuoteResponseSchema,
  ScriptV2RunResponseSchema,
  TransitionScriptV2RunRequestSchema,
} from '@/contracts/script-v2'
import {
  GetSkillResponseSchema,
  SkillListResponseSchema,
  ToggleSkillFavouriteRequestSchema,
  ToggleSkillFavouriteResponseSchema,
} from '@/contracts/skills'
import {
  ShowcaseDetailResponseSchema,
  ShowcaseEngagementRequestSchema,
  ShowcaseEngagementResponseSchema,
  ShowcaseListResponseSchema,
  ShowcasePlaybackManifestSchema,
} from '@/contracts/showcase'

export type JsonTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Transport-only seam for a future backend. Components keep using local `/api/*`
 * paths; the deployment adapter may supply fresh headers (for example a Bearer
 * token) without placing credentials in React state, fixtures, or route input.
 */
export type ApiClientOptions = {
  getHeaders?: () => HeadersInit | Promise<HeadersInit>
}

export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'EDIT_LEASE_CONFLICT'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMITED'
  | 'HTTP_ERROR'
  | 'INVALID_JSON'
  | 'INVALID_DATA'

function codeForStatus(status: number): ApiErrorCode {
  if (status === 400 || status === 422) return 'INVALID_INPUT'
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'REVISION_CONFLICT'
  if (status === 429) return 'RATE_LIMITED'
  return 'HTTP_ERROR'
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: ApiErrorCode = codeForStatus(status),
    public readonly details: unknown = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function errorFromBody(body: unknown, status: number): ApiError {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error
    if (typeof error === 'string') return new ApiError(status, error)
    if (error && typeof error === 'object') {
      const record = error as { code?: unknown; message?: unknown; details?: unknown }
      const code = typeof record.code === 'string' ? (record.code as ApiErrorCode) : codeForStatus(status)
      const message = typeof record.message === 'string' ? record.message : `请求失败 (${status})`
      return new ApiError(status, message, code, record.details)
    }
  }
  return new ApiError(status, `请求失败 (${status})`)
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new ApiError(502, '服务返回了无效 JSON', 'INVALID_JSON', error)
  }
}

function jsonInit(method: string, body: unknown, headers?: HeadersInit): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
  }
}

/**
 * The browser client is deliberately local-path only. A future backend can be
 * mounted by supplying a transport that prefixes these paths, but a component
 * must never smuggle an absolute LibTV/third-party URL into the mock boundary.
 */
function localApiPath(url: string): string {
  if (!url.startsWith('/') || url.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(url)) {
    throw new ApiError(400, 'API client 只接受本地相对路径', 'INVALID_INPUT', { url })
  }
  return url
}

export function createApiClient(transport: JsonTransport = fetch, options: ApiClientOptions = {}) {
  async function withTransportHeaders(init?: RequestInit): Promise<RequestInit | undefined> {
    if (!options.getHeaders) return init
    const headers = new Headers(await options.getHeaders())
    for (const [key, value] of new Headers(init?.headers)) headers.set(key, value)
    return { ...init, headers }
  }

  async function requestUnknown<T>(url: string, init?: RequestInit): Promise<T> {
    // Validate before asking a credential provider for headers: an invalid URL
    // must never trigger token refresh or transport-side effects.
    const localPath = localApiPath(url)
    const response = await transport(localPath, await withTransportHeaders(init))
    const body = await parseBody(response)
    if (!response.ok) throw errorFromBody(body, response.status)
    return body as T
  }

  async function requestTyped<T>(schema: ZodType<T>, url: string, init?: RequestInit): Promise<T> {
    const body = await requestUnknown<unknown>(url, init)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new ApiError(502, '服务返回的数据不符合契约', 'INVALID_DATA', parsed.error.issues)
    }
    return parsed.data
  }

  const raw = {
    get: <T>(url: string) => requestUnknown<T>(url),
    post: <T>(url: string, body?: unknown, headers?: HeadersInit) =>
      requestUnknown<T>(url, body === undefined ? { method: 'POST', headers } : jsonInit('POST', body, headers)),
    patch: <T>(url: string, body: unknown, headers?: HeadersInit) =>
      requestUnknown<T>(url, jsonInit('PATCH', body, headers)),
    put: <T>(url: string, body?: unknown, headers?: HeadersInit) =>
      requestUnknown<T>(url, body === undefined ? { method: 'PUT', headers } : jsonInit('PUT', body, headers)),
    del: <T>(url: string, headers?: HeadersInit) => requestUnknown<T>(url, { method: 'DELETE', headers }),
  }

  return {
    account: {
      get: () => requestTyped(AccountProfileResponseSchema, '/api/account'),
    },
    team: {
      get: () => requestTyped(TeamResponseSchema, '/api/team'),
      getSharedAssets: () => requestTyped(SharedAssetsResponseSchema, '/api/shared-assets'),
    },
    home: {
      get: () => requestTyped(HomeDiscoveryResponseSchema, '/api/home'),
    },
    projects: {
      list: () => requestTyped(ProjectListLocalResponseSchema, '/api/projects'),
      create: (input: z.input<typeof CreateProjectInputSchema>) => {
        const body = CreateProjectInputSchema.parse(input)
        return requestTyped(CreateProjectResponseSchema, '/api/projects', jsonInit('POST', body))
      },
    },
    recycleBin: {
      list: () => requestTyped(ListRecycleBinResponseSchema, '/api/recycle-bin'),
      restore: (projectId: string) =>
        requestTyped(
          RestoreRecycledProjectResponseSchema,
          `/api/recycle-bin/${encodeURIComponent(projectId)}`,
          { method: 'POST' },
        ),
      permanentlyDelete: (projectId: string) =>
        requestTyped(
          PermanentlyDeleteRecycledProjectResponseSchema,
          `/api/recycle-bin/${encodeURIComponent(projectId)}`,
          { method: 'DELETE' },
        ),
    },
    canvas: {
      bootstrap: (canvasId: string) =>
        requestTyped(CanvasDetailLocalResponseSchema, `/api/canvases/${encodeURIComponent(canvasId)}`),
      mutate: (canvasId: string, input: z.input<typeof MutationRequestSchema>) => {
        const body = MutationRequestSchema.parse(input)
        return requestTyped(
          MutationResultSchema,
          `/api/canvases/${encodeURIComponent(canvasId)}`,
          jsonInit('POST', body),
        )
      },
    },
    presence: {
      heartbeat: (canvasId: string, input: z.input<typeof PresenceHeartbeatRequestSchema>) => {
        const body = PresenceHeartbeatRequestSchema.parse(input)
        return requestTyped(
          PresenceHeartbeatResponseSchema,
          `/api/presence/${encodeURIComponent(canvasId)}`,
          jsonInit('POST', body),
        )
      },
      lease: (canvasId: string, input: z.input<typeof PresenceLeaseRequestSchema>) => {
        const body = PresenceLeaseRequestSchema.parse(input)
        return requestTyped(
          PresenceLeaseResponseSchema,
          `/api/presence/${encodeURIComponent(canvasId)}`,
          jsonInit('POST', body),
        )
      },
    },
    models: {
      list: (input: { media?: 'image' | 'video' | 'audio' | 'text'; query?: string } = {}) => {
        const params = new URLSearchParams()
        if (input.media) params.set('media', input.media)
        if (input.query?.trim()) params.set('q', input.query.trim())
        const suffix = params.toString()
        return requestTyped(ModelCatalogResponseSchema, `/api/models${suffix ? `?${suffix}` : ''}`)
      },
    },
    materials: {
      list: (input: {
        kind?: MaterialKind
        scope?: MaterialScope
        category?: string
        commercialOnly?: boolean
        modelId?: string | null
        query?: string
        offset?: number
        limit?: number
      } = {}) => {
        const params = new URLSearchParams()
        if (input.kind) params.set('kind', input.kind)
        if (input.scope) params.set('scope', input.scope)
        if (input.category) params.set('category', input.category)
        if (input.commercialOnly) params.set('commercialOnly', 'true')
        if (input.modelId) params.set('modelId', input.modelId)
        if (input.query?.trim()) params.set('q', input.query.trim())
        if (input.offset !== undefined) params.set('offset', String(input.offset))
        if (input.limit !== undefined) params.set('limit', String(input.limit))
        const suffix = params.toString()
        return requestTyped(MaterialCatalogResponseSchema, `/api/materials${suffix ? `?${suffix}` : ''}`)
      },
      get: (materialId: string) =>
        requestTyped(GetMaterialResponseSchema, `/api/materials/${encodeURIComponent(materialId)}`),
      setFavourite: (materialId: string, favourite: boolean) => {
        const body = ToggleMaterialFavouriteRequestSchema.parse({
          action: favourite ? 'favourite' : 'unfavourite',
        })
        return requestTyped(
          ToggleMaterialFavouriteResponseSchema,
          `/api/materials/${encodeURIComponent(materialId)}`,
          jsonInit('POST', body),
        )
      },
    },
    ledger: {
      list: (limit?: number) =>
        requestTyped(
          LedgerViewProjectionSchema,
          limit === undefined ? '/api/ledger' : `/api/ledger?limit=${encodeURIComponent(String(limit))}`,
        ),
    },
    showcase: {
      list: () => requestTyped(ShowcaseListResponseSchema, '/api/showcase'),
      detail: (snapshotId: string) =>
        requestTyped(ShowcaseDetailResponseSchema, `/api/showcase/${encodeURIComponent(snapshotId)}`),
      playback: (snapshotId: string) =>
        requestTyped(ShowcasePlaybackManifestSchema, `/api/showcase/${encodeURIComponent(snapshotId)}/playback`),
      engagement: (snapshotId: string) =>
        requestTyped(ShowcaseEngagementResponseSchema, `/api/showcase/${encodeURIComponent(snapshotId)}/engagement`),
      updateEngagement: (snapshotId: string, input: z.input<typeof ShowcaseEngagementRequestSchema>) => {
        const body = ShowcaseEngagementRequestSchema.parse(input)
        return requestTyped(
          ShowcaseEngagementResponseSchema,
          `/api/showcase/${encodeURIComponent(snapshotId)}/engagement`,
          jsonInit('POST', body),
        )
      },
    },
    jobs: {
      list: (canvasId?: string) =>
        requestTyped(
          ListJobsResponseSchema,
          canvasId === undefined ? '/api/jobs' : `/api/jobs?canvasId=${encodeURIComponent(canvasId)}`,
        ),
      create: (input: z.input<typeof CreateJobRequestSchema>) => {
        const body = CreateJobRequestSchema.parse(input)
        return requestTyped(CreateJobResponseSchema, '/api/jobs', jsonInit('POST', body))
      },
      get: (jobId: string) =>
        requestTyped(GetJobResponseSchema, `/api/jobs/${encodeURIComponent(jobId)}`),
      transition: (jobId: string, action: TransitionJobAction) => {
        const body = TransitionJobRequestSchema.parse({ action })
        return requestTyped(
          TransitionJobResponseSchema,
          `/api/jobs/${encodeURIComponent(jobId)}`,
          jsonInit('POST', body),
        )
      },
    },
    scriptV2: {
      quote: (
        input: z.input<typeof ScriptV2QuoteRequestSchema>,
        options: { signal?: AbortSignal } = {},
      ) => {
        const body = ScriptV2QuoteRequestSchema.parse(input)
        return requestTyped(
          ScriptV2QuoteResponseSchema,
          '/api/script-v2/quotes',
          { ...jsonInit('POST', body), signal: options.signal },
        )
      },
      createRun: (
        input: z.input<typeof CreateScriptV2RunRequestSchema>,
        options: { signal?: AbortSignal } = {},
      ) => {
        const body = CreateScriptV2RunRequestSchema.parse(input)
        return requestTyped(
          ScriptV2RunResponseSchema,
          '/api/script-v2/runs',
          { ...jsonInit('POST', body), signal: options.signal },
        )
      },
      getRun: (runId: string, options: { signal?: AbortSignal } = {}) =>
        requestTyped(
          ScriptV2RunResponseSchema,
          `/api/script-v2/runs/${encodeURIComponent(runId)}`,
          options.signal ? { signal: options.signal } : undefined,
        ),
      transitionRun: (
        runId: string,
        action: z.input<typeof TransitionScriptV2RunRequestSchema>['action'],
        options: { signal?: AbortSignal } = {},
      ) => {
        const body = TransitionScriptV2RunRequestSchema.parse({ action })
        return requestTyped(
          ScriptV2RunResponseSchema,
          `/api/script-v2/runs/${encodeURIComponent(runId)}`,
          { ...jsonInit('POST', body), signal: options.signal },
        )
      },
    },
    publish: {
      list: () => requestTyped(ListPublishedSnapshotsResponseSchema, '/api/publish'),
      get: (snapshotId: string) =>
        requestTyped(
          GetPublishedSnapshotResponseSchema,
          `/api/publish/${encodeURIComponent(snapshotId)}`,
        ),
      create: (input: z.input<typeof PublishRequestSchema>) => {
        const body = PublishRequestSchema.parse(input)
        return requestTyped(
          PublishCanvasResponseSchema,
          '/api/publish',
          jsonInit('POST', body),
        )
      },
      revoke: (snapshotId: string) =>
        requestTyped(
          RevokePublishedSnapshotResponseSchema,
          `/api/publish/${encodeURIComponent(snapshotId)}`,
          { method: 'DELETE' },
        ),
    },
    skills: {
      list: (input: { category?: string; collection?: string; query?: string } = {}) => {
        const params = new URLSearchParams()
        if (input.category) params.set('category', input.category)
        if (input.collection) params.set('collection', input.collection)
        if (input.query?.trim()) params.set('q', input.query.trim())
        const suffix = params.toString()
        return requestTyped(SkillListResponseSchema, `/api/skills${suffix ? `?${suffix}` : ''}`)
      },
      get: (skillId: string) =>
        requestTyped(GetSkillResponseSchema, `/api/skills/${encodeURIComponent(skillId)}`),
      setFavourite: (skillId: string, favourite: boolean) => {
        const body = ToggleSkillFavouriteRequestSchema.parse({
          action: favourite ? 'favourite' : 'unfavourite',
        })
        return requestTyped(
          ToggleSkillFavouriteResponseSchema,
          `/api/skills/${encodeURIComponent(skillId)}`,
          jsonInit('POST', body),
        )
      },
    },
    scenarios: {
      get: () => requestTyped(ScenarioResponseSchema, '/api/dev/scenario'),
      set: (scenarioId: ScenarioId) =>
        requestTyped(ScenarioResponseSchema, '/api/dev/scenario', jsonInit('POST', { scenarioId })),
    },
    raw,
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

export const client = createApiClient()
