import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ShowcaseDetailResponseSchema } from '@/contracts/showcase'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET } from './route'

describe.sequential('GET /api/showcase/[snapshotId]', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('resolves every catalog id through the same public detail projection', async () => {
    const response = await GET(new Request('http://localhost/api/showcase/pub_city_night_01'), {
      params: Promise.resolve({ snapshotId: 'pub_city_night_01' }),
    })
    const parsed = ShowcaseDetailResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(parsed.entry.id).toBe('pub_city_night_01')
    expect(parsed.entry.snapshotId).toBe('pub_city_night_01')
    expect(parsed.related.some((entry) => entry.id === 'showcase-dust-skeleton')).toBe(true)
    expect(new Set(parsed.related.map((entry) => entry.id)).size).toBe(parsed.related.length)
  })

  it('preserves the published snapshot boundary for an unknown id', async () => {
    const response = await GET(new Request('http://localhost/api/showcase/missing'), {
      params: Promise.resolve({ snapshotId: 'missing' }),
    })

    expect(response.status).toBe(404)
  })
})
