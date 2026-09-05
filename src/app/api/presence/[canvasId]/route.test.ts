import { describe, expect, it } from 'vitest'

import { GET, POST } from './route'

const invalidCanvasParams = { params: Promise.resolve({ canvasId: 'canvas with spaces' }) }

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
