import { NextResponse } from 'next/server'
import { HttpError, handle } from '@/server/http'
import {
  PRESENCE_LIMITS,
  PresenceError,
  attachStream,
  detachStream,
  heartbeat,
  snapshot,
  subscribe,
  type HeartbeatInput,
  type PresenceEvent,
  type PresencePoint,
  type PresenceViewport,
} from '@/server/presence'

/**
 * Presence transport.
 *
 * `GET` is a Server-Sent Events stream: a `ReadableStream` with
 * `text/event-stream`. `POST` is the heartbeat. Neither touches the workspace
 * store — presence is view state and must never reach `.data/workspace.json`.
 */

// A long-lived stream must not be cached, collapsed or statically analysed.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

type Params = { params: Promise<{ canvasId: string }> }

/**
 * Idle-connection keepalive. Nginx defaults to 60s and many corporate proxies
 * to 30s, so 20s leaves room for one lost frame before anything decides the
 * connection is dead. A comment frame is the cheapest thing on the wire and
 * every SSE parser is required to ignore it.
 */
const KEEPALIVE_MS = 20_000

const CANVAS_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** A keepalive tick must never be the reason a process refuses to exit. */
function unrefTimer(timer: unknown) {
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    ;(timer as { unref: () => void }).unref()
  }
}

function serialise(event: PresenceEvent): string {
  // JSON.stringify escapes newlines, so a hostile display name cannot inject
  // an extra `data:` line and forge a frame.
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

/* ------------------------------------------------------------------ *
 * Validation — the payload is a stranger, not a peer
 * ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNoUnknownKeys(value: Record<string, unknown>, allowed: string[], where: string) {
  for (const key of Object.keys(value)) {
    // Rejected, not ignored: a client sending a field this route never reads is
    // out of sync with it, and silently dropping it hides the drift.
    if (!allowed.includes(key)) throw new HttpError(400, `${where}包含未知字段 ${key}`)
  }
}

function readCoordinate(value: unknown, label: string): number {
  // `1e999` parses to Infinity, which would otherwise sail through `typeof`.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `${label} 必须是有限数字`)
  }
  if (Math.abs(value) > PRESENCE_LIMITS.maxCoordinate) {
    throw new HttpError(400, `${label} 超出画布坐标范围`)
  }
  return value
}

function readName(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, '显示名称必须是字符串')
  const name = value.trim()
  if (!name) throw new HttpError(400, '显示名称不能为空')
  // Count code points, so a Chinese or emoji name is measured the way it reads.
  if ([...name].length > PRESENCE_LIMITS.maxNameLength) {
    throw new HttpError(400, `显示名称最多 ${PRESENCE_LIMITS.maxNameLength} 个字符`)
  }
  // Control characters are rejected outright: they render as nothing and they
  // are the only thing that could try to forge an extra SSE `data:` line.
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new HttpError(400, '显示名称包含控制字符')
  return name
}

function readColor(value: unknown): string {
  if (typeof value !== 'string' || !PRESENCE_LIMITS.colorPattern.test(value)) {
    // Hex only: this string ends up in a `style` attribute on the cursor.
    throw new HttpError(400, '颜色必须是 #rrggbb 格式')
  }
  return value
}

function readCursor(value: unknown): PresencePoint | null {
  if (value === null || value === undefined) return null
  if (!isPlainObject(value)) throw new HttpError(400, '光标必须是对象或 null')
  assertNoUnknownKeys(value, ['x', 'y'], '光标')
  return { x: readCoordinate(value.x, '光标 x'), y: readCoordinate(value.y, '光标 y') }
}

function readViewport(value: unknown): PresenceViewport {
  if (!isPlainObject(value)) throw new HttpError(400, '视口必须是对象')
  assertNoUnknownKeys(value, ['x', 'y', 'zoom'], '视口')
  const zoom = value.zoom
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) {
    throw new HttpError(400, '视口缩放必须是有限数字')
  }
  if (zoom < PRESENCE_LIMITS.minZoom || zoom > PRESENCE_LIMITS.maxZoom) {
    throw new HttpError(400, '视口缩放超出范围')
  }
  return { x: readCoordinate(value.x, '视口 x'), y: readCoordinate(value.y, '视口 y'), zoom }
}

function readParticipantId(value: unknown): string {
  if (typeof value !== 'string' || !PRESENCE_LIMITS.idPattern.test(value)) {
    throw new HttpError(400, '参与者标识不合法')
  }
  return value
}

function parseHeartbeat(raw: unknown): HeartbeatInput {
  if (!isPlainObject(raw)) throw new HttpError(400, '心跳负载必须是对象')
  assertNoUnknownKeys(raw, ['participantId', 'name', 'color', 'cursor', 'viewport'], '心跳负载')
  return {
    participantId: readParticipantId(raw.participantId),
    name: readName(raw.name),
    color: readColor(raw.color),
    cursor: readCursor(raw.cursor),
    viewport: readViewport(raw.viewport),
  }
}

/** The stream identifies its own owner, so an abort knows who to remove. */
function parseStreamSelf(url: URL): HeartbeatInput {
  const zoom = url.searchParams.get('zoom')
  return {
    participantId: readParticipantId(url.searchParams.get('participantId')),
    name: readName(url.searchParams.get('name')),
    color: readColor(url.searchParams.get('color')),
    cursor: null,
    viewport: readViewport({
      x: Number(url.searchParams.get('x') ?? 0),
      y: Number(url.searchParams.get('y') ?? 0),
      zoom: zoom === null ? 1 : Number(zoom),
    }),
  }
}

function assertCanvasId(canvasId: string) {
  if (!CANVAS_ID_PATTERN.test(canvasId)) throw new HttpError(400, '画布标识不合法')
}

function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof PresenceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: message }, { status: 500 })
}
/* ------------------------------------------------------------------ *
 * GET — the stream
 * ------------------------------------------------------------------ */

/**
 * Build the SSE body for one subscriber.
 *
 * `start` runs synchronously inside the `ReadableStream` constructor, so a
 * rejected subscribe throws out of here and the caller can answer with the
 * status it deserves instead of a 500.
 */
function openPresenceStream(request: Request, canvasId: string, self: HeartbeatInput) {
  // Assigned inside `start` but also needed by `cancel`, which has no other
  // way to reach `start`'s locals. Both must land on the same teardown.
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
        // This is what makes a closed tab vanish immediately instead of
        // lingering for the TTL; the TTL only covers the case where neither
        // this nor `cancel` ever fires. Token-guarded, so a late abort from a
        // stream this client already replaced cannot evict the live one.
        if (token !== null) detachStream(canvasId, self.participantId, token)
        token = null
        try {
          controller.close()
        } catch {
          // Already closed by the runtime; nothing left to do.
        }
      }

      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // The peer went away between the abort and this write.
          teardown()
        }
      }

      // Aborted before the stream was even wired up: register nothing.
      if (request.signal.aborted) {
        closed = true
        try {
          controller.close()
        } catch {
          // Nothing to close.
        }
        return
      }

      try {
        // Order matters and is deliberately synchronous: nothing can be
        // published between reading the snapshot and registering the listener,
        // so no delta can slip past the snapshot frame.
        write(`: connected ${canvasId}\n\n`)
        write(serialise({ type: 'snapshot', participants: snapshot(canvasId) }))
        release = subscribe(canvasId, (event) => write(serialise(event)))
        token = attachStream(canvasId, self).token
      } catch (error) {
        // A rejected subscribe must still leave nothing behind: `teardown`
        // releases whatever did get registered before the throw.
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
        // `no-transform` matters as much as `no-cache`: a compressing proxy
        // would buffer frames and turn a live cursor into a slideshow.
        'Cache-Control': 'no-cache, no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

/* ------------------------------------------------------------------ *
 * POST — the heartbeat
 * ------------------------------------------------------------------ */

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { canvasId } = await params
    assertCanvasId(canvasId)

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      throw new HttpError(400, '心跳负载不是合法 JSON')
    }

    const input = parseHeartbeat(raw)
    try {
      return { ok: true, participant: heartbeat(canvasId, input) }
    } catch (error) {
      if (error instanceof PresenceError) throw new HttpError(error.status, error.message)
      throw error
    }
  })
}

/*
 * There is deliberately no DELETE. An explicit "I am leaving" call races the
 * stream it is trying to close: an unmount that immediately remounts (a canvas
 * switch, React's double-mount in dev) would have the first mount's DELETE
 * land after the second mount's stream registered, evicting a participant who
 * is very much still here. Departure is the stream's abort, which carries an
 * owner token and therefore cannot make that mistake.
 */
