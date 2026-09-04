import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ShowcaseListResponseSchema } from '@/contracts/showcase'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET } from './route'

describe.sequential('GET /api/showcase', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('serves the same stable discovery ids that home uses', async () => {
    const response = await GET()
    const parsed = ShowcaseListResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(parsed.entries.length).toBeGreaterThanOrEqual(6)
    expect(parsed.entries[0]).toMatchObject({
      id: 'pub_city_night_01',
      snapshotId: 'pub_city_night_01',
      title: '雨夜霓虹城市',
    })
  })

  it('keeps the public scenario deterministic and puts its live snapshot first', async () => {
    await resetStore('public-showcase')
    const first = await GET()
    await resetStore('public-showcase')
    const second = await GET()
    const firstBody = await first.json()
    const secondBody = await second.json()

    expect(firstBody).toEqual(secondBody)
    expect(secondBody.entries[0].snapshotId).toBe('pub_city_night_01')
  })
})
