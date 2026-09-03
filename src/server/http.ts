import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
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
  throw new HttpError(400, `${field}: ${issue?.message ?? '请求参数不合法'}`)
}

/** Uniform error envelope so the client can render a toast without guessing. */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    return NextResponse.json(await fn())
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : String(error)
    // Domain guards (validation, optimistic lock, insufficient credits) are
    // client-correctable, so they are 4xx rather than 500.
    const status =
      /不存在|已存在|不接受|循环|不能|需要|未选择|已过期|积分不足|冲突/.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
