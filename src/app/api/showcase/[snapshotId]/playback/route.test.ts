import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ShowcasePlaybackManifestSchema } from '@/contracts/showcase'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET } from './route'

describe.sequential('GET /api/showcase/[snapshotId]/playback', () => {
  beforeEach(async () => {
    await resetStore('public-showcase')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('returns ordered local-only quality variants for a public work', async () => {
    const response = await GET(new Request('http://localhost/api/showcase/pub_city_night_01/playback'), {
      params: Promise.resolve({ snapshotId: 'pub_city_night_01' }),
    })
    const parsed = ShowcasePlaybackManifestSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(parsed.fallbackOrder).toEqual(['720p', '480p', 'original'])
    expect(parsed.variants.map((variant) => variant.url)).toEqual([
      '/api/media/fixtures/city-night.mp4?quality=720p',
      '/api/media/fixtures/city-night.mp4?quality=480p',
      '/api/media/fixtures/city-night.mp4?quality=original',
    ])
  })

  it('keeps the public visibility boundary for unknown works', async () => {
    const response = await GET(new Request('http://localhost/api/showcase/missing/playback'), {
      params: Promise.resolve({ snapshotId: 'missing' }),
    })
    expect(response.status).toBe(404)
  })
})
