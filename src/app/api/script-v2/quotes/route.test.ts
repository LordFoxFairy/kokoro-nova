import { describe, expect, it } from 'vitest'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { ScriptV2QuoteResponseSchema } from '@/contracts/script-v2'
import { POST } from './route'

const url = 'http://localhost/api/script-v2/quotes'

function post(body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/script-v2/quotes route smoke', () => {
  it('returns a schema-valid deterministic quote for the documented operation', async () => {
    const response = await POST(post({
      operation: 'recompute-prompts',
      modelId: 'lib-image-2',
      shotCount: 21,
    }))
    const body = ScriptV2QuoteResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(body.quote).toMatchObject({
      operation: 'recompute-prompts',
      credits: 12,
      priceVersion: 'script-v2-local-1',
      breakdown: [{ credits: 12 }],
    })
  })

  it('uses the Script V2 422 invalid-input boundary', async () => {
    const response = await POST(post({ operation: 'recompute-prompts', modelId: 'lib-image-2', shotCount: 0 }))
    const body = LocalErrorEnvelopeSchema.parse(await response.json())

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      error: { code: 'INVALID_INPUT', message: expect.stringContaining('shotCount') },
      requestId: expect.any(String),
    })
  })
})
