import { NextResponse } from 'next/server'

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
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
