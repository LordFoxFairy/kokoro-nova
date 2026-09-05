'use client'

import { create } from 'zustand'
import { ApiError, client } from '@/lib/api'
import type { EditorLease } from '@/contracts/presence'
import type { Participant, PresenceEvent, PresencePoint, PresenceViewport } from '@/server/presence'

/**
 * Presence client.
 *
 * Opens the SSE stream, coalesces outgoing cursor heartbeats, and holds the
 * participant list plus the follow target. Everything here is ephemeral view
 * state: it never goes through `useEditor.commit` / `applyMutations`, and the
 * server never persists it. A cursor moving is not a document edit.
 *
 * The types are imported from the hub with `import type`, so no server code
 * reaches the browser bundle — the import is erased at compile time.
 */

export type { Participant, PresencePoint, PresenceViewport }

export interface PresenceSelf {
  id: string
  name: string
  color: string
}

/**
 * One request per mousemove would be one request per frame. 70ms is just above
 * a 60Hz frame so every burst of moves inside a frame collapses into a single
 * POST, while ~14 updates a second still reads as a smooth remote cursor.
 */
const CURSOR_THROTTLE_MS = 70

/** Idle keepalive: three of these fit inside the server's 15s TTL. */
const IDLE_HEARTBEAT_MS = 4_000

/** Reconnect backoff: 0.8s, 1.6s, 3.2s … capped, with jitter. */
const RECONNECT_BASE_MS = 800
const RECONNECT_MAX_MS = 15_000

/** A frame this large is a broken peer, not a cursor update. */
const MAX_FRAME_BYTES = 256 * 1024

interface PresenceState {
  canvasId: string | null
  self: PresenceSelf | null
  connected: boolean
  /** Remote participants only; the local user is never in this list. */
  participants: Participant[]
  followingId: string | null
  /** The one editable seat is independent of read-only follow presence. */
  editorLease: EditorLease | null
  editorLeaseState: 'idle' | 'acquiring' | 'active' | 'blocked'
  editorLeaseMessage: string | null
}

interface PresenceActions {
  follow: (participantId: string | null) => void
  /** Local pan/zoom, Esc, or the banner's 取消 all land here. */
  breakFollow: () => void
}

export const usePresence = create<PresenceState & PresenceActions>((set) => ({
  canvasId: null,
  self: null,
  connected: false,
  participants: [],
  followingId: null,
  editorLease: null,
  editorLeaseState: 'idle',
  editorLeaseMessage: null,

  follow: (followingId) => set({ followingId }),
  breakFollow: () => set((state) => (state.followingId === null ? state : { followingId: null })),
}))

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

const SELF_STORAGE_KEY = 'novavideo.presence.self'

const PALETTE = [
  '#4c7ef3',
  '#e0684f',
  '#2fa37a',
  '#d9932b',
  '#8b5cf0',
  '#d9528f',
  '#0e9bc4',
  '#6f9c2e',
] as const

function randomId(): string {
  const bytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Identity for this tab.
 *
 * Deliberately `sessionStorage`, not `localStorage`: two tabs of the same
 * browser are two collaborators, which is exactly what someone opening a
 * second tab to try this out expects to see.
 */
export function loadPresenceSelf(): PresenceSelf {
  const fallback = (): PresenceSelf => {
    const id = randomId()
    return {
      id,
      name: `协作者 ${id.slice(0, 4).toUpperCase()}`,
      color: PALETTE[parseInt(id.slice(0, 2), 16) % PALETTE.length],
    }
  }

  if (typeof window === 'undefined') return fallback()
  try {
    const raw = window.sessionStorage.getItem(SELF_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PresenceSelf>
      if (
        typeof parsed.id === 'string' &&
        typeof parsed.name === 'string' &&
        typeof parsed.color === 'string'
      ) {
        return { id: parsed.id, name: parsed.name, color: parsed.color }
      }
    }
    const created = fallback()
    window.sessionStorage.setItem(SELF_STORAGE_KEY, JSON.stringify(created))
    return created
  } catch {
    // Private mode, disabled storage — presence still works, just per-load.
    return fallback()
  }
}

/* ------------------------------------------------------------------ *
 * Connection
 * ------------------------------------------------------------------ */

interface Connection {
  canvasId: string
  self: PresenceSelf
  abort: AbortController
  /** Set once `disconnectPresence` runs; every async tail checks it. */
  closed: boolean
  attempt: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  flushTimer: ReturnType<typeof setTimeout> | null
  idleTimer: ReturnType<typeof setInterval> | null
  /** Latest values only — this is the coalescing buffer. */
  cursor: PresencePoint | null
  viewport: PresenceViewport
  lastSentAt: number
  leaseId: string | null
}

let active: Connection | null = null

function applyEvent(event: PresenceEvent, selfId: string) {
  usePresence.setState((state) => {
    switch (event.type) {
      case 'snapshot':
        return { participants: event.participants.filter((p) => p.id !== selfId) }
      case 'join':
      case 'move': {
        if (event.participant.id === selfId) return state
        const index = state.participants.findIndex((p) => p.id === event.participant.id)
        if (index === -1) return { participants: [...state.participants, event.participant] }
        const participants = state.participants.slice()
        participants[index] = event.participant
        return { participants }
      }
      case 'leave': {
        if (event.participantId === selfId) return state
        return {
          participants: state.participants.filter((p) => p.id !== event.participantId),
          // Following someone who just left would strand the camera under a
          // banner naming a person who is no longer here.
          followingId: state.followingId === event.participantId ? null : state.followingId,
        }
      }
      default:
        return state
    }
  })
}

function streamUrl(conn: Connection): string {
  const query = new URLSearchParams({
    participantId: conn.self.id,
    name: conn.self.name,
    color: conn.self.color,
    x: String(Math.round(conn.viewport.x)),
    y: String(Math.round(conn.viewport.y)),
    zoom: String(conn.viewport.zoom),
  })
  return `/api/presence/${encodeURIComponent(conn.canvasId)}?${query.toString()}`
}

/** Parse one SSE frame: comment lines are ignored, `data:` lines are the event. */
function parseFrame(frame: string): PresenceEvent | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data) as PresenceEvent
  } catch {
    return null
  }
}

async function readStream(conn: Connection) {
  const response = await fetch(streamUrl(conn), {
    signal: conn.abort.signal,
    cache: 'no-store',
    headers: { Accept: 'text/event-stream' },
  })
  if (!response.ok || !response.body) {
    throw new Error(`presence stream ${response.status}`)
  }

  // A successful open resets the backoff, so a long-lived connection that
  // eventually drops retries fast rather than inheriting an old penalty.
  conn.attempt = 0
  usePresence.setState({ connected: true })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done || conn.closed) break
    buffer += decoder.decode(value, { stream: true })
    for (;;) {
      const boundary = buffer.indexOf('\n\n')
      if (boundary === -1) break
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const event = parseFrame(frame)
      if (event) applyEvent(event, conn.self.id)
    }
    // Never let a peer that stopped emitting frame boundaries grow this
    // unboundedly.
    if (buffer.length > MAX_FRAME_BYTES) buffer = ''
  }
}

function scheduleReconnect(conn: Connection) {
  if (conn.closed || conn.reconnectTimer !== null) return
  conn.attempt += 1
  const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (conn.attempt - 1))
  // Jitter so N tabs that dropped on the same server restart do not stampede.
  const delay = backoff * (0.7 + Math.random() * 0.6)
  conn.reconnectTimer = setTimeout(() => {
    conn.reconnectTimer = null
    void openStream(conn)
  }, delay)
}

async function openStream(conn: Connection) {
  if (conn.closed) return
  try {
    await readStream(conn)
  } catch {
    // Aborts are our own doing; anything else is a drop worth retrying.
  }
  if (conn.closed) return
  usePresence.setState({ connected: false, participants: [] })
  scheduleReconnect(conn)
}

/* ------------------------------------------------------------------ *
 * Outgoing heartbeats
 * ------------------------------------------------------------------ */

async function sendHeartbeat(conn: Connection) {
  if (conn.closed) return
  conn.lastSentAt = Date.now()
  try {
    await client.presence.heartbeat(conn.canvasId, {
      participantId: conn.self.id,
      name: conn.self.name,
      color: conn.self.color,
      cursor: conn.cursor,
      viewport: conn.viewport,
    })
  } catch {
    // A dropped heartbeat is recoverable: the next one lands, or the TTL
    // removes us and the stream reconnect re-announces us.
  }
}

function isCurrent(conn: Connection) {
  return active === conn && !conn.closed
}

/** Lease acquisition never blocks the SSE stream: rejected peers can follow. */
async function acquireEditingLease(conn: Connection) {
  if (!isCurrent(conn)) return
  usePresence.setState({ editorLeaseState: 'acquiring', editorLeaseMessage: null })
  try {
    const response = await client.presence.lease(conn.canvasId, {
      action: 'acquire',
      participantId: conn.self.id,
    })
    const lease = response.lease
    if (!lease) return
    if (!isCurrent(conn)) {
      // A route unmounted while the request was in flight. Do not leave a
      // phantom editor seat behind for its former participant.
      await client.presence.lease(conn.canvasId, {
        action: 'release',
        participantId: conn.self.id,
        leaseId: lease.leaseId,
      }).catch(() => undefined)
      return
    }
    conn.leaseId = lease.leaseId
    usePresence.setState({ editorLease: lease, editorLeaseState: 'active', editorLeaseMessage: null })
  } catch (error) {
    if (!isCurrent(conn)) return
    const message = error instanceof Error ? error.message : '编辑会话暂时不可用'
    usePresence.setState({
      editorLease: null,
      editorLeaseState: error instanceof ApiError && error.code === 'EDIT_LEASE_CONFLICT' ? 'blocked' : 'idle',
      editorLeaseMessage: message,
    })
  }
}

async function renewEditingLease(conn: Connection) {
  const leaseId = conn.leaseId
  if (!isCurrent(conn) || !leaseId) return
  try {
    const response = await client.presence.lease(conn.canvasId, {
      action: 'heartbeat',
      participantId: conn.self.id,
      leaseId,
    })
    if (!isCurrent(conn) || !response.lease) return
    usePresence.setState({ editorLease: response.lease, editorLeaseState: 'active', editorLeaseMessage: null })
  } catch (error) {
    if (!isCurrent(conn)) return
    conn.leaseId = null
    usePresence.setState({
      editorLease: null,
      editorLeaseState: 'blocked',
      editorLeaseMessage: error instanceof Error ? error.message : '编辑会话已过期',
    })
  }
}

async function releaseEditingLease(conn: Connection) {
  const leaseId = conn.leaseId
  conn.leaseId = null
  if (!leaseId) return
  try {
    await client.presence.lease(conn.canvasId, {
      action: 'release',
      participantId: conn.self.id,
      leaseId,
    })
  } catch {
    // Stream teardown is a second, token-guarded release path.
  }
}

/** Explicit retry is used after the current editor closes or releases. */
export function retryPresenceEditorLease() {
  if (!active) return Promise.resolve()
  return acquireEditingLease(active)
}

/**
 * Coalescing scheduler. A hundred mousemoves inside one frame all just
 * overwrite `conn.cursor`; at most one POST leaves per `CURSOR_THROTTLE_MS`.
 */
function scheduleHeartbeat(conn: Connection) {
  if (conn.closed || conn.flushTimer !== null) return
  const wait = Math.max(0, CURSOR_THROTTLE_MS - (Date.now() - conn.lastSentAt))
  conn.flushTimer = setTimeout(() => {
    conn.flushTimer = null
    void sendHeartbeat(conn)
  }, wait)
}

/** Report the local cursor in flow coordinates. Safe to call every mousemove. */
export function reportCursor(cursor: PresencePoint | null) {
  const conn = active
  if (!conn) return
  conn.cursor = cursor
  scheduleHeartbeat(conn)
}

/** Report the local camera. Safe to call on every transform change. */
export function reportViewport(viewport: PresenceViewport) {
  const conn = active
  if (!conn) return
  conn.viewport = viewport
  scheduleHeartbeat(conn)
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

export function connectPresence(canvasId: string, self: PresenceSelf) {
  if (active && active.canvasId === canvasId && active.self.id === self.id) return
  disconnectPresence()

  const conn: Connection = {
    canvasId,
    self,
    abort: new AbortController(),
    closed: false,
    attempt: 0,
    reconnectTimer: null,
    flushTimer: null,
    idleTimer: null,
    cursor: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    lastSentAt: 0,
    leaseId: null,
  }
  active = conn

  usePresence.setState({
    canvasId,
    self,
    connected: false,
    participants: [],
    followingId: null,
    editorLease: null,
    editorLeaseState: 'acquiring',
    editorLeaseMessage: null,
  })

  conn.idleTimer = setInterval(() => {
    scheduleHeartbeat(conn)
    void renewEditingLease(conn)
  }, IDLE_HEARTBEAT_MS)
  void acquireEditingLease(conn)
  void openStream(conn)
}

export function disconnectPresence() {
  const conn = active
  if (!conn) return
  active = null
  conn.closed = true
  if (conn.reconnectTimer !== null) clearTimeout(conn.reconnectTimer)
  if (conn.flushTimer !== null) clearTimeout(conn.flushTimer)
  if (conn.idleTimer !== null) clearInterval(conn.idleTimer)
  conn.reconnectTimer = null
  conn.flushTimer = null
  conn.idleTimer = null

  void releaseEditingLease(conn)

  // Aborting the stream *is* the departure: the server tears the participant
  // down on the request abort. No separate "goodbye" call, because that would
  // race a remount and delete the connection that just replaced this one.
  conn.abort.abort()

  usePresence.setState({
    canvasId: null,
    self: null,
    connected: false,
    participants: [],
    followingId: null,
    editorLease: null,
    editorLeaseState: 'idle',
    editorLeaseMessage: null,
  })
}

/* ------------------------------------------------------------------ *
 * Selectors
 * ------------------------------------------------------------------ */

export function usePresenceParticipants(): Participant[] {
  return usePresence((s) => s.participants)
}

/** The participant currently being followed, or null. */
export function useFollowTarget(): Participant | null {
  return usePresence((s) =>
    s.followingId === null ? null : (s.participants.find((p) => p.id === s.followingId) ?? null),
  )
}
