import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { presenceStreamHandshakeError } from '@/lib/presence-client'

describe('presence stream handshake errors', () => {
  it('preserves a normalized ErrorResponse for reconnect diagnostics', async () => {
    const response = Response.json({
      error: {
        code: 'EDIT_LEASE_CONFLICT',
        message: '当前画布正在由另一位协作者编辑',
        details: { canvasId: 'can_fixture', ownerClientId: 'alice' },
      },
      requestId: 'req_local_presence_stream_conflict',
    }, { status: 409 })

    const error = await presenceStreamHandshakeError(response)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'EDIT_LEASE_CONFLICT',
      message: '当前画布正在由另一位协作者编辑',
      details: { canvasId: 'can_fixture', ownerClientId: 'alice' },
      requestId: 'req_local_presence_stream_conflict',
    })
  })

  it('keeps the compact transport fallback when the non-OK stream response has no envelope', async () => {
    const error = await presenceStreamHandshakeError(new Response('gateway unavailable', { status: 503 }))

    expect(error).toEqual(new Error('presence stream 503'))
  })
})
