import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  PresenceError,
  acquireEditorLease,
  heartbeat,
  presenceDebug,
  releaseEditorLease,
  resetPresence,
  snapshot,
} from '@/server/presence'

describe('editor lease ownership', () => {
  beforeEach(() => {
    resetPresence()
  })

  afterEach(() => {
    resetPresence()
  })

  it('rejects a second editor, then hands the same ephemeral canvas to them after release', () => {
    const canvasId = 'cvs_lease_fixture'
    const alice = acquireEditorLease(canvasId, 'alice', 1_000)

    expect(alice).toMatchObject({
      canvasId,
      clientId: 'alice',
      state: 'active',
    })
    expect(() => acquireEditorLease(canvasId, 'bob', 1_001)).toThrow(
      expect.objectContaining({
        name: 'PresenceError',
        status: 409,
        code: 'EDIT_LEASE_CONFLICT',
      }),
    )

    // Presence/lease state does not mutate a workflow document. A cursor can
    // continue to move while another collaborator owns the editor seat.
    heartbeat(canvasId, {
      participantId: 'bob',
      name: 'Bob',
      color: '#4c7ef3',
      cursor: { x: 240, y: 160 },
      viewport: { x: 0, y: 0, zoom: 1 },
    }, 1_002)
    expect(snapshot(canvasId).map((participant) => participant.id)).toEqual(['bob'])

    expect(releaseEditorLease(canvasId, 'alice', alice.leaseId)).toBe(true)
    const bob = acquireEditorLease(canvasId, 'bob', 1_003)
    expect(bob).toMatchObject({ canvasId, clientId: 'bob', state: 'active' })
    expect(bob.leaseId).not.toBe(alice.leaseId)

    expect(releaseEditorLease(canvasId, 'bob', bob.leaseId)).toBe(true)
    expect(presenceDebug().canvases[0]).toMatchObject({
      id: canvasId,
      participants: 1,
      editorLease: null,
    })
  })

  it('never lets a stale owner release a replacement lease', () => {
    const canvasId = 'cvs_lease_stale'
    const alice = acquireEditorLease(canvasId, 'alice', 1_000)
    expect(releaseEditorLease(canvasId, 'alice', alice.leaseId)).toBe(true)
    const bob = acquireEditorLease(canvasId, 'bob', 1_001)

    expect(() => releaseEditorLease(canvasId, 'alice', alice.leaseId)).toThrow(PresenceError)
    expect(presenceDebug().canvases[0]?.editorLease).toMatchObject({
      clientId: 'bob',
      leaseId: bob.leaseId,
    })
  })
})
