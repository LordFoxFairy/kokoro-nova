import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  EditorLeaseSchema,
  PresenceHeartbeatResponseSchema,
  PresenceParticipantSchema,
} from '@/contracts/presence'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { resetPresence } from '@/server/presence'
import { GET, POST } from './route'

const invalidCanvasParams = { params: Promise.resolve({ canvasId: 'canvas with spaces' }) }
const canvasId = 'cvs_presence_contract'

const SnapshotFrameSchema = z.object({
  type: z.literal('snapshot'),
  participants: z.array(PresenceParticipantSchema),
}).strict()

function params(id = canvasId) {
  return { params: Promise.resolve({ canvasId: id }) }
}

function jsonRequest(body: unknown) {
  return new Request(`http://localhost/api/presence/${canvasId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readOpeningSnapshot(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('presence response did not expose an SSE body')

  const decoder = new TextDecoder()
  let text = ''
  try {
    // The route writes a connection comment then the snapshot synchronously.
    // Keep this loop frame-oriented rather than assuming a ReadableStream
    // enqueue maps one-to-one to a reader chunk in every runtime.
    for (let index = 0; index < 4; index += 1) {
      const { done, value } = await reader.read()
      text += decoder.decode(value, { stream: !done })
      const snapshot = text
        .split('\n\n')
        .find((frame) => frame.startsWith('event: snapshot\n'))
      if (snapshot) {
        const data = snapshot.split('\n').find((line) => line.startsWith('data: '))?.slice('data: '.length)
        if (!data) throw new Error('snapshot frame did not contain a data line')
        return { text, frame: SnapshotFrameSchema.parse(JSON.parse(data)) }
      }
      if (done) break
    }
    throw new Error('presence stream did not emit a snapshot frame')
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

beforeEach(() => {
  resetPresence()
})

afterEach(() => {
  resetPresence()
})

describe('presence route error transport', () => {
  it('returns the canonical ErrorResponse for an invalid heartbeat route', async () => {
    const response = await POST(
      new Request('http://localhost/api/presence/canvas%20with%20spaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      invalidCanvasParams,
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({
      error: { code: 'INVALID_INPUT', message: '画布标识不合法' },
      requestId: expect.stringMatching(/^req_local_[a-z0-9_]+$/),
    })
  })

  it('returns the canonical ErrorResponse before opening an invalid SSE stream', async () => {
    const response = await GET(
      new Request('http://localhost/api/presence/canvas%20with%20spaces'),
      invalidCanvasParams,
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_INPUT', message: '画布标识不合法' },
      requestId: expect.any(String),
    })
  })
})

describe('presence route special transport success contract', () => {
  it('opens an SSE stream with the required headers and a schema-valid first business snapshot', async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/presence/${canvasId}?participantId=alice&name=Alice&color=%234c7ef3&x=12&y=-4&zoom=1.25`,
      ),
      params(),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-cache, no-store, no-transform')
    expect(response.headers.get('connection')).toBe('keep-alive')
    expect(response.headers.get('x-accel-buffering')).toBe('no')

    const opening = await readOpeningSnapshot(response)
    expect(opening.text).toContain(`: connected ${canvasId}\n\n`)
    expect(opening.frame).toEqual({ type: 'snapshot', participants: [] })
  })

  it('accepts heartbeat and acquire/renew/release lease transitions with typed success bodies', async () => {
    const heartbeat = await POST(
      jsonRequest({
        participantId: 'alice',
        name: 'Alice',
        color: '#4C7EF3',
        cursor: { x: 120, y: -80 },
        viewport: { x: 4, y: 8, zoom: 1.5 },
      }),
      params(),
    )
    expect(heartbeat.status).toBe(200)
    expect(heartbeat.headers.get('content-type')).toContain('application/json')
    expect(PresenceHeartbeatResponseSchema.parse(await heartbeat.json())).toMatchObject({
      ok: true,
      participant: {
        id: 'alice',
        color: '#4c7ef3',
        cursor: { x: 120, y: -80 },
        viewport: { x: 4, y: 8, zoom: 1.5 },
      },
    })

    const acquired = await POST(jsonRequest({ action: 'acquire', participantId: 'alice' }), params())
    expect(acquired.status).toBe(200)
    const acquireBody = await acquired.json()
    const lease = EditorLeaseSchema.parse(acquireBody.lease)
    expect(acquireBody).toMatchObject({ ok: true, action: 'acquire' })

    const renewed = await POST(
      jsonRequest({ action: 'heartbeat', participantId: 'alice', leaseId: lease.leaseId }),
      params(),
    )
    expect(renewed.status).toBe(200)
    expect(EditorLeaseSchema.parse((await renewed.json()).lease)).toMatchObject({
      canvasId,
      clientId: 'alice',
      leaseId: lease.leaseId,
      state: 'active',
    })

    const released = await POST(
      jsonRequest({ action: 'release', participantId: 'alice', leaseId: lease.leaseId }),
      params(),
    )
    expect(released.status).toBe(200)
    expect(await released.json()).toEqual({ ok: true, action: 'release', lease: null })
  })

  it('preserves lease conflict and expired-session domain codes and details in JSON error envelopes', async () => {
    const acquired = await POST(jsonRequest({ action: 'acquire', participantId: 'alice' }), params())
    const lease = EditorLeaseSchema.parse((await acquired.json()).lease)

    const conflict = await POST(jsonRequest({ action: 'acquire', participantId: 'bob' }), params())
    expect(conflict.status).toBe(409)
    const conflictBody = LocalErrorEnvelopeSchema.parse(await conflict.json())
    expect(conflictBody).toMatchObject({
      error: {
        code: 'EDIT_LEASE_CONFLICT',
        details: { canvasId, ownerClientId: 'alice', expiresAt: lease.expiresAt },
      },
      requestId: expect.stringMatching(/^req_local_[a-z0-9_]+$/),
    })

    const expired = await POST(
      jsonRequest({ action: 'heartbeat', participantId: 'alice', leaseId: 'lease_stale' }),
      params(),
    )
    expect(expired.status).toBe(409)
    expect(LocalErrorEnvelopeSchema.parse(await expired.json())).toMatchObject({
      error: { code: 'SESSION_EXPIRED', details: { canvasId } },
      requestId: expect.stringMatching(/^req_local_[a-z0-9_]+$/),
    })
  })
})
