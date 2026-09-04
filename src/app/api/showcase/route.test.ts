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
    const response = await GET(new Request('http://localhost/api/showcase?limit=24'))
    const parsed = ShowcaseListResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(parsed.entries.length).toBeGreaterThanOrEqual(6)
    expect(parsed.page).toMatchObject({ offset: 0, limit: 24, total: parsed.entries.length, hasMore: false })
    expect(parsed.entries[0]).toMatchObject({
      id: 'pub_city_night_01',
      snapshotId: 'pub_city_night_01',
      title: '雨夜霓虹城市',
    })
  })

  it('keeps the public scenario deterministic and puts its live snapshot first', async () => {
    await resetStore('public-showcase')
    const first = await GET(new Request('http://localhost/api/showcase?limit=4'))
    await resetStore('public-showcase')
    const second = await GET(new Request('http://localhost/api/showcase?limit=4'))
    const firstBody = await first.json()
    const secondBody = await second.json()

    expect(firstBody).toEqual(secondBody)
    expect(secondBody.entries[0].snapshotId).toBe('pub_city_night_01')
    expect(secondBody.page).toMatchObject({ limit: 4, hasMore: true, nextOffset: 4 })
  })

  it('pages category results, preserves semantic-search fallback, and exposes deterministic empty/error fixtures', async () => {
    const first = await GET(new Request('http://localhost/api/showcase?category=专业影视&limit=2'))
    const firstBody = ShowcaseListResponseSchema.parse(await first.json())
    const second = await GET(new Request(`http://localhost/api/showcase?category=专业影视&limit=2&offset=${firstBody.page.nextOffset}`))
    const secondBody = ShowcaseListResponseSchema.parse(await second.json())
    const fallback = await GET(new Request('http://localhost/api/showcase?category=专业影视&q=不存在的验证词&limit=24'))
    const empty = await GET(new Request('http://localhost/api/showcase?fixture=empty'))
    const error = await GET(new Request('http://localhost/api/showcase?fixture=error'))

    expect(firstBody.page).toMatchObject({ total: 3, hasMore: true, nextOffset: 2 })
    expect(secondBody.entries).toHaveLength(1)
    expect(ShowcaseListResponseSchema.parse(await fallback.json()).page.searchFallback).toBe(true)
    expect(ShowcaseListResponseSchema.parse(await empty.json()).page.total).toBe(0)
    expect(error.status).toBe(503)
  })

})
