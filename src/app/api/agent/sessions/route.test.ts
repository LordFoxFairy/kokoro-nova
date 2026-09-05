import { describe, expect, it } from 'vitest'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { POST } from './route'

describe('Agent session route', () => {
  it('rejects malformed creation input with the standard 400 ErrorResponse envelope', async () => {
    const response = await POST(new Request('http://localhost/api/agent/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 42 }),
    }))

    expect(response.status).toBe(400)
    expect(LocalErrorEnvelopeSchema.parse(await response.json())).toMatchObject({
      error: { code: 'INVALID_INPUT' },
      requestId: expect.stringMatching(/^req_local_/),
    })
  })
})
