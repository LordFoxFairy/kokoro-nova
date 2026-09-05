import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { LedgerViewProjectionSchema } from '@/contracts/ledger'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET } from './route'

function request(query = '') {
  return new Request(`http://localhost/api/ledger${query}`)
}

describe.sequential('GET /api/ledger', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('projects the persisted ledger with typed job links and a limit that does not change totals', async () => {
    const fullResponse = await GET(request())
    const full = LedgerViewProjectionSchema.parse(await fullResponse.json())
    const limitedResponse = await GET(request('?limit=1'))
    const limited = LedgerViewProjectionSchema.parse(await limitedResponse.json())

    expect(fullResponse.status).toBe(200)
    expect(fullResponse.headers.get('content-type')).toContain('application/json')
    expect(full.balance).toBe(full.totals.earned - full.totals.spent)
    expect(Object.values(full.jobs)).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectId: 'prj_video_demo', canvasId: 'can_video_main' }),
    ]))
    expect(limited.earned).toHaveLength(Math.min(1, full.earned.length))
    expect(limited.spent).toHaveLength(Math.min(1, full.spent.length))
    expect(limited.returned).toHaveLength(Math.min(1, full.returned.length))
    expect(limited.counts).toEqual(full.counts)
    expect(limited.totals).toEqual(full.totals)
  })

  it('returns the standard invalid-input envelope for malformed limits', async () => {
    const response = await GET(request('?limit=0'))
    const body = LocalErrorEnvelopeSchema.parse(await response.json())

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({ code: 'INVALID_INPUT', message: 'limit 需要是正整数' })
  })
})
