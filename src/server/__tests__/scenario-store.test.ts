import { afterAll, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { activeScenarioId, invalidateCache, readState, resetStore, withState } from '@/server/store'

describe.sequential('scenario-backed workspace store', () => {
  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('resets to an explicitly selected deterministic scenario', async () => {
    const first = await resetStore('video-failed')
    invalidateCache()
    const second = await readState()

    expect(second).toEqual(first)
    expect(second.jobs[0]).toMatchObject({ id: 'job_video_01', status: 'failed' })
    expect(await activeScenarioId()).toBe('video-failed')
  })

  it('plain reset restores the active scenario rather than changing fixtures', async () => {
    await resetStore('video-running')
    await withState((state) => {
      state.projects.splice(0)
    })

    const restored = await resetStore()
    expect(restored.projects.some((project) => project.id === 'prj_video_demo')).toBe(true)
    expect(restored.jobs[0].status).toBe('running')
    expect(await activeScenarioId()).toBe('video-running')
  })

  it('uses the same default scenario after both caches and files are initialized', async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    invalidateCache()

    expect(await activeScenarioId()).toBe(DEFAULT_SCENARIO_ID)
    expect((await readState()).projects).toHaveLength(0)
  })
})
