import type { z, ZodType } from 'zod'

import { HomeDiscoveryResponseSchema } from '@/contracts/home'
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
  ProjectListLocalResponseSchema,
  ScenarioResponseSchema,
} from '@/contracts/local'
import type { ScenarioId } from '@/contracts/scenario'
import {
  CreateScriptV2RunRequestSchema,
  ScriptV2QuoteRequestSchema,
  ScriptV2QuoteResponseSchema,
  ScriptV2RunResponseSchema,
  TransitionScriptV2RunRequestSchema,
} from '@/contracts/script-v2'

export type JsonTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
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

export function createApiClient(transport: JsonTransport = fetch) {
  async function requestUnknown<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await transport(localApiPath(url), init)
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
    canvas: {
      bootstrap: (canvasId: string) =>
        requestTyped(CanvasDetailLocalResponseSchema, `/api/canvases/${encodeURIComponent(canvasId)}`),
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
