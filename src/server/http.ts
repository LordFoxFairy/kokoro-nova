import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

function codeForStatus(status: number): string {
  if (status === 400 || status === 422) return 'INVALID_INPUT'
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'REVISION_CONFLICT'
  if (status === 429) return 'RATE_LIMITED'
  if (status === 500) return 'INTERNAL_ERROR'
  if (status === 503) return 'SERVICE_UNAVAILABLE'
  return 'HTTP_ERROR'
}

/** Stable across fixture resets without exposing request input or credentials. */
function requestIdFor(status: number, message: string): string {
  let hash = 2166136261
  for (const char of `${status}:${message}`) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return `req_local_${(hash >>> 0).toString(36)}`
}

function errorResponse(status: number, message: string, code?: string, details?: unknown) {
  return NextResponse.json(
    {
      error: {
        code: code ?? codeForStatus(status),
        message,
        ...(details === undefined ? {} : { details }),
      },
      requestId: requestIdFor(status, message),
    },
    { status },
  )
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  options: { validationStatus?: number } = {},
): Promise<T> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new HttpError(400, '请求 JSON 不合法')
  }

  const parsed = schema.safeParse(body)
  if (parsed.success) return parsed.data

  const issue = parsed.error.issues[0]
  const field = issue?.path.length ? issue.path.join('.') : 'body'
  throw new HttpError(
    options.validationStatus ?? 400,
    `${field}: ${issue?.message ?? '请求参数不合法'}`,
  )
}

/** Uniform error envelope so the client can render a toast without guessing. */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    return NextResponse.json(await fn())
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.status, error.message, error.code, error.details)
    }
    const message = error instanceof Error ? error.message : String(error)
    // Domain guards (validation, optimistic lock, insufficient credits) are
    // client-correctable, so they are 4xx rather than 500.
    const status =
      /不存在|已存在|不接受|循环|不能|需要|未选择|已过期|积分不足|冲突/.test(message) ? 400 : 500
    return errorResponse(status, message)
  }
}
