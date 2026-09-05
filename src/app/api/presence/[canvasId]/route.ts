import { NextResponse } from 'next/server'
import {
  PresenceHeartbeatRequestSchema,
  PresenceUpdateRequestSchema,
  type PresenceHeartbeatRequest,
} from '@/contracts/presence'
import { HttpError, parseJsonBody } from '@/server/http'
import {
  PresenceError,
  acquireEditorLease,
  attachStream,
  detachStream,
  heartbeat,
  heartbeatEditorLease,
  releaseEditorLease,
  snapshot,
  subscribe,
  type PresenceEvent,
} from '@/server/presence'

/**
 * Presence transport.
 *
 * `GET` is a Server-Sent Events stream. `POST` accepts either a typed cursor
 * heartbeat or one editor-lease action. Both are ephemeral and never touch
 * the workspace store or WorkflowDocument.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

type Params = { params: Promise<{ canvasId: string }> }

/** Keep proxies from timing out an otherwise idle collaboration stream. */
const KEEPALIVE_MS = 20_000
const CANVAS_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function unrefTimer(timer: unknown) {
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    ;(timer as { unref: () => void }).unref()
  }
}

function serialise(event: PresenceEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

/** The stream identifies its owner so stale aborts cannot evict reconnects. */
function parseStreamSelf(url: URL): PresenceHeartbeatRequest {
  const parsed = PresenceHeartbeatRequestSchema.safeParse({
    participantId: url.searchParams.get('participantId'),
    name: url.searchParams.get('name'),
    color: url.searchParams.get('color'),
    cursor: null,
    viewport: {
      x: Number(url.searchParams.get('x') ?? 0),
      y: Number(url.searchParams.get('y') ?? 0),
      zoom: Number(url.searchParams.get('zoom') ?? 1),
    },
  })
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  throw new HttpError(400, `${issue?.path.join('.') || 'query'}: ${issue?.message ?? '订阅参数不合法'}`)
}

function assertCanvasId(canvasId: string) {
  if (!CANVAS_ID_PATTERN.test(canvasId)) throw new HttpError(400, '画布标识不合法')
}

function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof PresenceError) {
    return NextResponse.json(
      error.code
        ? { error: { code: error.code, message: error.message, details: error.details ?? null } }
        : { error: error.message },
      { status: error.status },
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: message }, { status: 500 })
}

/** Build one SSE stream; its teardown owns both listener and participant. */
function openPresenceStream(request: Request, canvasId: string, self: PresenceHeartbeatRequest) {
  let teardown: () => void = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      let closed = false
      let release: (() => void) | null = null
      let keepalive: ReturnType<typeof setInterval> | null = null
      let token: number | null = null

      teardown = () => {
        if (closed) return
        closed = true
        request.signal.removeEventListener('abort', teardown)
        if (keepalive !== null) {
          clearInterval(keepalive)
          keepalive = null
        }
        release?.()
        release = null
        if (token !== null) detachStream(canvasId, self.participantId, token)
        token = null
        try {
          controller.close()
        } catch {
          // The peer already closed the controller.
        }
      }

      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          teardown()
        }
      }

      if (request.signal.aborted) {
        closed = true
        try {
          controller.close()
        } catch {
          // Nothing reached the wire.
        }
        return
      }

      try {
        // Snapshot then listener is synchronous: no delta can fall between.
        write(`: connected ${canvasId}\n\n`)
        write(serialise({ type: 'snapshot', participants: snapshot(canvasId) }))
        release = subscribe(canvasId, (event) => write(serialise(event)))
        token = attachStream(canvasId, self).token
      } catch (error) {
        teardown()
        throw error
      }

      keepalive = setInterval(() => write(': keepalive\n\n'), KEEPALIVE_MS)
      unrefTimer(keepalive)
      request.signal.addEventListener('abort', teardown)
    },
    cancel() {
      teardown()
    },
  })

  return stream
}

export async function GET(request: Request, { params }: Params) {
  const { canvasId } = await params
  try {
    assertCanvasId(canvasId)
    const self = parseStreamSelf(new URL(request.url))
    return new Response(openPresenceStream(request, canvasId, self), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * Typed local state mutation boundary. A rejected editor may keep calling the
 * heartbeat variant and follow the active owner; only lease acquisition is
 * serialized and conflict-bearing.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { canvasId } = await params
    assertCanvasId(canvasId)
    const input = await parseJsonBody(request, PresenceUpdateRequestSchema)

    if (!('action' in input)) {
      return NextResponse.json({ ok: true, participant: heartbeat(canvasId, input) })
    }

    if (input.action === 'acquire') {
      return NextResponse.json({ ok: true, action: input.action, lease: acquireEditorLease(canvasId, input.participantId) })
    }
    if (input.action === 'heartbeat') {
      return NextResponse.json({
        ok: true,
        action: input.action,
        lease: heartbeatEditorLease(canvasId, input.participantId, input.leaseId!),
      })
    }

    releaseEditorLease(canvasId, input.participantId, input.leaseId!)
    return NextResponse.json({ ok: true, action: input.action, lease: null })
  } catch (error) {
    return errorResponse(error)
  }
}
