/**
 * In-process collaboration presence hub.
 *
 * Presence is *ephemeral view state*: who is looking at a canvas, where their
 * cursor is, how their camera is framed. A cursor moving is not a document
 * edit, so none of this goes near `withState`, `.data/workspace.json`,
 * `applyMutations` or `expectedRevision`. Nothing in this file imports the
 * workspace store, and nothing here is ever persisted — it lives in process
 * memory and dies with the process. That is deliberate: presence that outlives
 * the connection is worse than no presence at all.
 *
 * DEPLOYMENT LIMIT — stated plainly rather than implied away: fanout is
 * per Node process. Two app instances behind a load balancer keep two separate
 * `rooms` maps, and a participant on instance A is invisible to subscribers on
 * instance B. Making this multi-instance means replacing `publish` with a
 * shared bus (Redis pub/sub, Postgres LISTEN/NOTIFY) and re-deriving the
 * participant map from it; the exported interface below can stay as it is.
 */

export interface PresencePoint {
  x: number
  y: number
}

export interface PresenceViewport {
  x: number
  y: number
  zoom: number
}

export interface Participant {
  id: string
  name: string
  /** `#rrggbb`; validated so it can be dropped straight into a style attr. */
  color: string
  /** Flow coordinates, never screen pixels — every camera is different. */
  cursor: PresencePoint | null
  viewport: PresenceViewport
  /** Epoch ms of the last heartbeat; drives TTL expiry. */
  lastSeenAt: number
}

export type PresenceEvent =
  | { type: 'snapshot'; participants: Participant[] }
  | { type: 'join'; participant: Participant }
  | { type: 'move'; participant: Participant }
  | { type: 'leave'; participantId: string; reason: 'closed' | 'expired' }

export type PresenceListener = (event: PresenceEvent) => void

export interface HeartbeatInput {
  participantId: string
  name: string
  color: string
  cursor: PresencePoint | null
  viewport: PresenceViewport
}

/** Rejected at the HTTP boundary; also enforced here as a second line. */
export class PresenceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'PresenceError'
  }
}

export const PRESENCE_LIMITS = {
  /** Opaque client id; deliberately not a workspace id, presence owns it. */
  idPattern: /^[A-Za-z0-9_-]{1,64}$/,
  maxNameLength: 24,
  colorPattern: /^#[0-9a-fA-F]{6}$/,
  /**
   * The canvas is infinite in principle but a real graph lives within a few
   * thousand units of the origin. A million is generous headroom and still
   * rejects the `1e308` a fuzzer sends to make a cursor div blow up layout.
   */
  maxCoordinate: 1_000_000,
  minZoom: 0.01,
  maxZoom: 100,
  /** Past this the avatar stack is meaningless and memory is not free. */
  maxParticipantsPerCanvas: 64,
  /** One tab holds one stream; a client opening 128 is not collaborating. */
  maxListenersPerCanvas: 128,
} as const

/**
 * A participant is dropped this long after their last heartbeat.
 *
 * The client sends at most one heartbeat per ~70ms while the cursor moves and
 * one every 4s while idle, so 15s is a little over three missed idle beats.
 * Shorter and a GC pause or a slow mobile uplink makes people flicker out of
 * the avatar stack; longer and a hard-killed tab — one where neither the
 * request abort nor `cancel()` ever fires — haunts the canvas for a quarter of
 * a minute. The stream teardown removes people immediately in the normal case;
 * this TTL only has to cover the abnormal one.
 */
export const PRESENCE_TTL_MS = 15_000

/**
 * How often a room re-checks its own participants. Worst-case detection
 * latency is therefore TTL + SWEEP; 5s keeps that under 20s while costing one
 * cheap map walk per open canvas.
 */
export const PRESENCE_SWEEP_MS = 5_000

interface Room {
  participants: Map<string, Participant>
  /**
   * Which open stream currently owns each participant.
   *
   * A reconnect (or React's double-mount in dev) registers the same
   * participant on a new stream while the old stream's abort is still in
   * flight. Without an owner token the stale teardown evicts the live
   * registration and the person blinks out of everyone else's avatar stack
   * until their next heartbeat.
   */
  owners: Map<string, number>
  listeners: Set<PresenceListener>
  sweeper: ReturnType<typeof setInterval>
}

let nextStreamToken = 1

const rooms = new Map<string, Room>()

/**
 * Live timer count, maintained only in `startSweeper`/`destroyRoom`. It exists
 * so a test can assert that the last unsubscribe really cleared the interval
 * rather than merely dropping the reference to it.
 */
let liveTimers = 0

/* ------------------------------------------------------------------ *
 * Room lifecycle
 *
 * The leak guarantee, concretely:
 *   1. `ensureRoom` is the only place a room is created, and it creates
 *      exactly one timer with it.
 *   2. `destroyRoom` is the only place `rooms.delete` and `clearInterval` are
 *      called, and it calls both. "Room gone" and "timer cleared" therefore
 *      cannot drift apart.
 *   3. `collect` is the only caller of `destroyRoom`, and every path that can
 *      remove the last listener or the last participant ends in `collect`:
 *      unsubscribe, leave, sweep, and the fanout path that drops a dead
 *      listener.
 *   4. A room's timer itself calls `collect`, so a room reached by a heartbeat
 *      but never subscribed to still disappears once its participants expire.
 * Together: no reachable state has a room with zero listeners and zero
 * participants, so a disconnect cannot leave a timer or a listener array behind.
 * ------------------------------------------------------------------ */

function unrefTimer(timer: unknown) {
  // Node hands back a Timeout; a browser/DOM lib typing hands back a number.
  // A presence sweep must never be the reason a process refuses to exit.
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    ;(timer as { unref: () => void }).unref()
  }
}

function startSweeper(canvasId: string) {
  liveTimers += 1
  const timer = setInterval(() => {
    sweepRoom(canvasId)
  }, PRESENCE_SWEEP_MS)
  unrefTimer(timer)
  return timer
}

function ensureRoom(canvasId: string): Room {
  const existing = rooms.get(canvasId)
  if (existing) return existing
  const room: Room = {
    participants: new Map(),
    owners: new Map(),
    listeners: new Set(),
    sweeper: startSweeper(canvasId),
  }
  rooms.set(canvasId, room)
  return room
}

function destroyRoom(canvasId: string, room: Room) {
  clearInterval(room.sweeper)
  liveTimers -= 1
  room.listeners.clear()
  room.participants.clear()
  room.owners.clear()
  rooms.delete(canvasId)
}

/** The single place a room is allowed to die. See the block comment above. */
function collect(canvasId: string, room: Room) {
  // Identity check: a stale closure must never tear down a room that was
  // already recycled and re-created under the same id.
  if (rooms.get(canvasId) !== room) return
  if (room.listeners.size > 0 || room.participants.size > 0) return
  destroyRoom(canvasId, room)
}

/* ------------------------------------------------------------------ *
 * Subscribe / publish
 * ------------------------------------------------------------------ */

/**
 * Register an SSE listener for one canvas. The returned unsubscribe is
 * idempotent, because React strict mode and a request abort both race to call
 * it and a second call must not be able to reach a room it no longer owns.
 */
export function subscribe(canvasId: string, listener: PresenceListener): () => void {
  const room = ensureRoom(canvasId)
  if (room.listeners.size >= PRESENCE_LIMITS.maxListenersPerCanvas) {
    // Undo a room that only came into existence for this rejected connection.
    collect(canvasId, room)
    throw new PresenceError(429, '这个画布的实时连接数已达上限')
  }

  // Wrapped so that subscribing the same function twice yields two independent
  // listeners. A Set keyed on the raw reference would silently dedupe them, and
  // then one unsubscribe would cut off both streams.
  const entry: PresenceListener = (event) => listener(event)
  room.listeners.add(entry)

  let released = false
  return () => {
    if (released) return
    released = true
    if (rooms.get(canvasId) !== room) return
    room.listeners.delete(entry)
    collect(canvasId, room)
  }
}

/** Fan an event out to one canvas's subscribers. No other canvas sees it. */
export function publish(canvasId: string, event: PresenceEvent) {
  const room = rooms.get(canvasId)
  if (!room) return
  publishTo(canvasId, room, event)
}

function publishTo(canvasId: string, room: Room, event: PresenceEvent) {
  let dead: PresenceListener[] | null = null
  for (const listener of room.listeners) {
    try {
      listener(event)
    } catch {
      // A throwing listener is a stream whose controller is already closed.
      // Drop it instead of letting one dead tab abort fanout to everyone else.
      ;(dead ??= []).push(listener)
    }
  }
  if (!dead) return
  for (const listener of dead) room.listeners.delete(listener)
  collect(canvasId, room)
}

/* ------------------------------------------------------------------ *
 * Participants
 * ------------------------------------------------------------------ */

function clampCoordinate(value: number): number {
  const limit = PRESENCE_LIMITS.maxCoordinate
  if (!Number.isFinite(value)) return 0
  return Math.min(limit, Math.max(-limit, value))
}

function normalise(input: HeartbeatInput, now: number): Participant {
  const name = input.name.trim().slice(0, PRESENCE_LIMITS.maxNameLength)
  return {
    id: input.participantId,
    name: name || '协作者',
    color: PRESENCE_LIMITS.colorPattern.test(input.color) ? input.color.toLowerCase() : '#8b95a5',
    cursor: input.cursor
      ? { x: clampCoordinate(input.cursor.x), y: clampCoordinate(input.cursor.y) }
      : null,
    viewport: {
      x: clampCoordinate(input.viewport.x),
      y: clampCoordinate(input.viewport.y),
      zoom: Math.min(
        PRESENCE_LIMITS.maxZoom,
        Math.max(PRESENCE_LIMITS.minZoom, Number.isFinite(input.viewport.zoom) ? input.viewport.zoom : 1),
      ),
    },
    lastSeenAt: now,
  }
}

/**
 * Upsert a participant and tell the canvas about it.
 *
 * `now` is injectable so TTL behaviour is testable without fake timers.
 */
export function heartbeat(canvasId: string, input: HeartbeatInput, now = Date.now()): Participant {
  if (!PRESENCE_LIMITS.idPattern.test(input.participantId)) {
    throw new PresenceError(400, '参与者标识不合法')
  }

  const room = ensureRoom(canvasId)
  const known = room.participants.has(input.participantId)
  if (!known && room.participants.size >= PRESENCE_LIMITS.maxParticipantsPerCanvas) {
    collect(canvasId, room)
    throw new PresenceError(429, '这个画布的协作人数已达上限')
  }

  const participant = normalise(input, now)
  room.participants.set(participant.id, participant)
  publishTo(canvasId, room, known ? { type: 'move', participant } : { type: 'join', participant })
  return participant
}

/** Remove a participant. Returns false when there was nobody to remove. */
export function leave(
  canvasId: string,
  participantId: string,
  reason: 'closed' | 'expired' = 'closed',
): boolean {
  const room = rooms.get(canvasId)
  if (!room) return false
  room.owners.delete(participantId)
  if (!room.participants.delete(participantId)) {
    // Still collect: this may have been the last thing keeping the room alive.
    collect(canvasId, room)
    return false
  }
  publishTo(canvasId, room, { type: 'leave', participantId, reason })
  collect(canvasId, room)
  return true
}

/**
 * Register a participant as owned by a newly opened stream.
 *
 * The returned token is the stream's claim on that participant; only the
 * holder of the current token may tear the participant down again.
 */
export function attachStream(
  canvasId: string,
  input: HeartbeatInput,
  now = Date.now(),
): { participant: Participant; token: number } {
  const participant = heartbeat(canvasId, input, now)
  const token = nextStreamToken
  nextStreamToken += 1
  // `heartbeat` created the room if it did not exist, so this lookup is safe.
  rooms.get(canvasId)?.owners.set(participant.id, token)
  return { participant, token }
}

/**
 * Close a stream's claim. A no-op when a newer stream has already taken over,
 * which is exactly what stops a late abort from evicting a live reconnect.
 */
export function detachStream(canvasId: string, participantId: string, token: number): boolean {
  const room = rooms.get(canvasId)
  if (!room) return false
  if (room.owners.get(participantId) !== token) return false
  return leave(canvasId, participantId, 'closed')
}

/** Current participants of one canvas, for the opening snapshot frame. */
export function snapshot(canvasId: string): Participant[] {
  const room = rooms.get(canvasId)
  return room ? [...room.participants.values()] : []
}

/**
 * Expire everyone in one canvas who stopped heartbeating, and tell the
 * remaining subscribers. Exported so tests can drive it deterministically.
 */
export function sweepRoom(canvasId: string, now = Date.now()): string[] {
  const room = rooms.get(canvasId)
  if (!room) return []

  const expired: string[] = []
  for (const [id, participant] of room.participants) {
    if (now - participant.lastSeenAt > PRESENCE_TTL_MS) expired.push(id)
  }
  for (const id of expired) {
    room.participants.delete(id)
    // Ownership dies with the participant, so the owning stream's later
    // teardown finds no claim and cannot evict a re-joined newcomer.
    room.owners.delete(id)
    publishTo(canvasId, room, { type: 'leave', participantId: id, reason: 'expired' })
  }
  collect(canvasId, room)
  return expired
}

/** Sweep every room. Used by tests; each room also sweeps itself on a timer. */
export function sweepAll(now = Date.now()): number {
  let total = 0
  for (const canvasId of [...rooms.keys()]) total += sweepRoom(canvasId, now).length
  return total
}

/* ------------------------------------------------------------------ *
 * Introspection — tests and nothing else
 * ------------------------------------------------------------------ */

export function presenceDebug() {
  return {
    rooms: rooms.size,
    timers: liveTimers,
    canvases: [...rooms.entries()].map(([id, room]) => ({
      id,
      listeners: room.listeners.size,
      participants: room.participants.size,
    })),
  }
}

/** Drop every room. Test isolation only; never called by a route. */
export function resetPresence() {
  for (const [canvasId, room] of [...rooms]) destroyRoom(canvasId, room)
}
