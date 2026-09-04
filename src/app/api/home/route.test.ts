import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { HomeDiscoveryResponseSchema } from '@/contracts/home'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET } from './route'

describe.sequential('GET /api/home', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('combines state-backed recent projects with deterministic discovery data', async () => {
    const response = await GET()
    const parsed = HomeDiscoveryResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(parsed.recentProjects.map((project) => project.id)).toEqual([
      'prj_untitled_demo',
      'prj_doro_demo',
      'prj_video_demo',
    ])
    expect(parsed.account.credits).toBe(408)
    expect(parsed.creatorTools).toHaveLength(6)
    expect(parsed.showcase.length).toBeGreaterThanOrEqual(6)
    expect(parsed.showcase[0]).toMatchObject({ id: 'pub_city_night_01', snapshotId: 'pub_city_night_01' })
    expect(new Set(parsed.showcase.map((entry) => entry.id)).size).toBe(parsed.showcase.length)
  })

  it('keeps public discovery available when the account has no projects', async () => {
    await resetStore('anonymous')

    const response = await GET()
    const parsed = HomeDiscoveryResponseSchema.parse(await response.json())

    expect(parsed.recentProjects).toEqual([])
    expect(parsed.account.credits).toBe(0)
    expect(parsed.showcase.length).toBeGreaterThanOrEqual(6)
  })
})
