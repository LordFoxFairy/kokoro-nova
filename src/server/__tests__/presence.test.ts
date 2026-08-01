import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PRESENCE_LIMITS,
  PRESENCE_SWEEP_MS,
  PRESENCE_TTL_MS,
  PresenceError,
  attachStream,
  detachStream,
  heartbeat,
  leave,
  presenceDebug,
  publish,
  resetPresence,
  snapshot,
  subscribe,
  sweepAll,
  sweepRoom,
  type HeartbeatInput,
  type PresenceEvent,
} from '@/server/presence'

/**
 * The hub is driven directly here — no HTTP, no store.
 *
 * The load-bearing case is cleanup: a presence hub that keeps a timer or a
 * listener array alive after the last disconnect leaks one of each per canvas
 * ever opened, and nothing in the UI would ever show it. Every test therefore
 * ends by asserting `presenceDebug()` is back to zero rooms *and* zero timers.
 */

function input(id: string, overrides: Partial<HeartbeatInput> = {}): HeartbeatInput {
  return {
    participantId: id,
    name: `协作者 ${id}`,
    color: '#4c7ef3',
    cursor: { x: 10, y: 20 },
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  }
}

function collector() {
  const events: PresenceEvent[] = []
  const listener = (event: PresenceEvent) => {
    events.push(event)
  }
  return { events, listener }
}

beforeEach(() => {
  resetPresence()
})

afterEach(() => {
  resetPresence()
  vi.useRealTimers()
})

describe('join and leave', () => {
  it('announces a join, then updates, then a leave', () => {
    const { events, listener } = collector()
    const release = subscribe('cvs_a', listener)

    heartbeat('cvs_a', input('p1'))
    heartbeat('cvs_a', input('p1', { cursor: { x: 40, y: 50 } }))
    leave('cvs_a', 'p1')

    expect(events.map((e) => e.type)).toEqual(['join', 'move', 'leave'])
    expect(events[0]).toMatchObject({ type: 'join', participant: { id: 'p1', name: '协作者 p1' } })
    expect(events[1]).toMatchObject({ type: 'move', participant: { cursor: { x: 40, y: 50 } } })
    expect(events[2]).toEqual({ type: 'leave', participantId: 'p1', reason: 'closed' })

    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('exposes a snapshot of everyone currently on the canvas', () => {
    const release = subscribe('cvs_a', () => {})
    heartbeat('cvs_a', input('p1'))
    heartbeat('cvs_a', input('p2'))

    expect(snapshot('cvs_a').map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(snapshot('cvs_other')).toEqual([])

    leave('cvs_a', 'p2')
    expect(snapshot('cvs_a').map((p) => p.id)).toEqual(['p1'])

    leave('cvs_a', 'p1')
    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('reports a leave for someone who was never there as a no-op', () => {
    const { events, listener } = collector()
    const release = subscribe('cvs_a', listener)

    expect(leave('cvs_a', 'ghost')).toBe(false)
    expect(events).toEqual([])

    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('clamps absurd coordinates instead of storing them', () => {
    const release = subscribe('cvs_a', () => {})
    const participant = heartbeat(
      'cvs_a',
      input('p1', { cursor: { x: 1e12, y: -1e12 }, viewport: { x: 0, y: 0, zoom: 1e6 } }),
    )

    expect(participant.cursor).toEqual({
      x: PRESENCE_LIMITS.maxCoordinate,
      y: -PRESENCE_LIMITS.maxCoordinate,
    })
    expect(participant.viewport.zoom).toBe(PRESENCE_LIMITS.maxZoom)

    leave('cvs_a', 'p1')
    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('rejects a malformed participant id', () => {
    expect(() => heartbeat('cvs_a', input('../../etc/passwd'))).toThrow(PresenceError)
    // The rejected heartbeat must not have left a room behind either.
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })
})

describe('stream ownership', () => {
  it('lets a reconnect take over before the old stream tears down', () => {
    const { events, listener } = collector()
    const release = subscribe('cvs_a', listener)

    // The tab connects, drops, and reconnects; the old abort arrives late.
    const first = attachStream('cvs_a', input('p1'))
    const second = attachStream('cvs_a', input('p1'))
    events.length = 0

    expect(detachStream('cvs_a', 'p1', first.token)).toBe(false)
    expect(snapshot('cvs_a').map((p) => p.id)).toEqual(['p1'])
    expect(events).toEqual([])

    // The stream that actually owns the participant still removes them.
    expect(detachStream('cvs_a', 'p1', second.token)).toBe(true)
    expect(events).toEqual([{ type: 'leave', participantId: 'p1', reason: 'closed' }])
    expect(snapshot('cvs_a')).toEqual([])

    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('drops a claim when the TTL removed the participant first', () => {
    const release = subscribe('cvs_a', () => {})
    const start = 3_000_000
    const { token } = attachStream('cvs_a', input('p1'), start)

    expect(sweepRoom('cvs_a', start + PRESENCE_TTL_MS + 1)).toEqual(['p1'])
    // The owning stream tears down afterwards; there is nothing left to remove
    // and, crucially, no stale claim that could evict a re-joiner.
    expect(detachStream('cvs_a', 'p1', token)).toBe(false)

    heartbeat('cvs_a', input('p1'), start + PRESENCE_TTL_MS + 2)
    expect(detachStream('cvs_a', 'p1', token)).toBe(false)
    expect(snapshot('cvs_a').map((p) => p.id)).toEqual(['p1'])

    leave('cvs_a', 'p1')
    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })
})

describe('TTL expiry', () => {
  it('drops a participant that stopped heartbeating and tells the rest', () => {
    const { events, listener } = collector()
    const release = subscribe('cvs_a', listener)

    const start = 1_000_000
    heartbeat('cvs_a', input('idle'), start)
    heartbeat('cvs_a', input('active'), start)
    events.length = 0

    // Just inside the TTL: nobody goes yet.
    expect(sweepRoom('cvs_a', start + PRESENCE_TTL_MS)).toEqual([])
    expect(events).toEqual([])

    // `active` keeps beating; `idle` does not.
    heartbeat('cvs_a', input('active'), start + PRESENCE_TTL_MS)
    events.length = 0

    expect(sweepRoom('cvs_a', start + PRESENCE_TTL_MS + 1)).toEqual(['idle'])
    expect(events).toEqual([{ type: 'leave', participantId: 'idle', reason: 'expired' }])
    expect(snapshot('cvs_a').map((p) => p.id)).toEqual(['active'])

    leave('cvs_a', 'active')
    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('expires participants on its own timer, without any subscriber', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T00:00:00.000Z'))

    // A heartbeat with no SSE listener still opens a room; without a sweeper
    // that room would be immortal.
    heartbeat('cvs_a', input('p1'))
    expect(presenceDebug()).toMatchObject({ rooms: 1, timers: 1 })

    vi.advanceTimersByTime(PRESENCE_TTL_MS + PRESENCE_SWEEP_MS + 1)

    expect(snapshot('cvs_a')).toEqual([])
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('sweeps every canvas at once', () => {
    const start = 2_000_000
    heartbeat('cvs_a', input('p1'), start)
    heartbeat('cvs_b', input('p2'), start)

    expect(sweepAll(start + PRESENCE_TTL_MS + 1)).toBe(2)
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })
})

describe('fanout isolation', () => {
  it('delivers a canvas event only to that canvas subscribers', () => {
    const a = collector()
    const b = collector()
    const releaseA = subscribe('cvs_a', a.listener)
    const releaseA2 = subscribe('cvs_a', a.listener)
    const releaseB = subscribe('cvs_b', b.listener)

    heartbeat('cvs_a', input('p1'))

    // Two listeners on cvs_a, so the same event arrives twice there.
    expect(a.events).toHaveLength(2)
    expect(b.events).toEqual([])

    heartbeat('cvs_b', input('p2'))
    expect(b.events.map((e) => e.type)).toEqual(['join'])
    expect(a.events).toHaveLength(2)

    publish('cvs_b', { type: 'leave', participantId: 'p2', reason: 'closed' })
    expect(b.events).toHaveLength(2)
    expect(a.events).toHaveLength(2)

    // Publishing to a canvas nobody opened is a no-op, not a room.
    publish('cvs_none', { type: 'leave', participantId: 'x', reason: 'closed' })
    expect(presenceDebug().canvases.map((c) => c.id).sort()).toEqual(['cvs_a', 'cvs_b'])

    leave('cvs_a', 'p1')
    leave('cvs_b', 'p2')
    releaseA()
    releaseA2()
    releaseB()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('drops a listener that throws without aborting fanout to the others', () => {
    const good = collector()
    const releaseBad = subscribe('cvs_a', () => {
      throw new Error('stream already closed')
    })
    const releaseGood = subscribe('cvs_a', good.listener)

    heartbeat('cvs_a', input('p1'))
    expect(good.events.map((e) => e.type)).toEqual(['join'])
    expect(presenceDebug().canvases[0]).toMatchObject({ listeners: 1 })

    leave('cvs_a', 'p1')
    releaseBad()
    releaseGood()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })
})

describe('cleanup', () => {
  it('leaves no room, listener or timer behind after the last unsubscribe', () => {
    const releases = ['cvs_a', 'cvs_b', 'cvs_c'].map((id) => {
      const release = subscribe(id, () => {})
      heartbeat(id, input('p1'))
      return { id, release }
    })
    expect(presenceDebug()).toMatchObject({ rooms: 3, timers: 3 })

    for (const { id, release } of releases) {
      release()
      // A participant is still registered, so the room legitimately survives
      // the unsubscribe — it dies when the last of *either* kind goes.
      expect(presenceDebug().canvases.find((c) => c.id === id)).toMatchObject({
        listeners: 0,
        participants: 1,
      })
      leave(id, 'p1')
      expect(presenceDebug().canvases.find((c) => c.id === id)).toBeUndefined()
    }

    expect(presenceDebug()).toEqual({ rooms: 0, timers: 0, canvases: [] })
  })

  it('collects a room whose last listener leaves before anyone joined', () => {
    const release = subscribe('cvs_a', () => {})
    expect(presenceDebug()).toMatchObject({ rooms: 1, timers: 1 })
    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('makes a repeated unsubscribe a no-op that cannot tear down a new room', () => {
    const release = subscribe('cvs_a', () => {})
    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })

    // Someone else opens the same canvas; the stale closure must not touch it.
    const { events, listener } = collector()
    const secondRelease = subscribe('cvs_a', listener)
    release()
    release()

    heartbeat('cvs_a', input('p1'))
    expect(events.map((e) => e.type)).toEqual(['join'])
    expect(presenceDebug()).toMatchObject({ rooms: 1, timers: 1 })

    leave('cvs_a', 'p1')
    secondRelease()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('does not accumulate timers when a canvas is opened and closed repeatedly', () => {
    for (let i = 0; i < 50; i += 1) {
      const release = subscribe('cvs_a', () => {})
      heartbeat('cvs_a', input('p1'))
      leave('cvs_a', 'p1')
      release()
    }
    expect(presenceDebug()).toEqual({ rooms: 0, timers: 0, canvases: [] })
  })

  it('caps participants per canvas and still collects the room afterwards', () => {
    const release = subscribe('cvs_a', () => {})
    for (let i = 0; i < PRESENCE_LIMITS.maxParticipantsPerCanvas; i += 1) {
      heartbeat('cvs_a', input(`p${i}`))
    }
    expect(() => heartbeat('cvs_a', input('one-too-many'))).toThrow(PresenceError)
    // An existing participant is still allowed to keep beating at the cap.
    expect(() => heartbeat('cvs_a', input('p0'))).not.toThrow()

    for (let i = 0; i < PRESENCE_LIMITS.maxParticipantsPerCanvas; i += 1) leave('cvs_a', `p${i}`)
    release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
  })

  it('caps concurrent listeners without leaking the room it had to create', () => {
    const releases = Array.from({ length: PRESENCE_LIMITS.maxListenersPerCanvas }, () =>
      subscribe('cvs_a', () => {}),
    )
    expect(() => subscribe('cvs_a', () => {})).toThrow(PresenceError)

    for (const release of releases) release()
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })

    // The rejection path on a brand new canvas must not strand a room either.
    expect(presenceDebug().canvases).toEqual([])
  })
})
