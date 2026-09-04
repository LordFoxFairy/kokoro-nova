import { afterAll, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { CREATION_CONTEXT_EMPTY_FIXTURE } from '@/mocks/creation-context'
import { DEFAULT_LOCAL_PREFERENCES } from '@/mocks/identity'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { buildScenario } from '@/mocks/scenarios/build'
import { readHomeCreationContext, writeHomeCreationContext } from '@/server/creation-context'
import { readLocalIdentity, readLocalPreferences, updateLocalPreferences, updateLocalSession } from '@/server/identity'
import { heartbeat, presenceDebug } from '@/server/presence'
import { activeScenarioId, DATA_DIR, invalidateCache, readState, resetStore, withState } from '@/server/store'

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

  it('refreshes its cache when another route bundle rewrites the shared state file', async () => {
    await resetStore('authenticated-empty')
    expect((await readState()).projects).toHaveLength(0)

    const stateFromAnotherBundle = buildScenario('authenticated-populated')
    await fs.writeFile(
      path.join(DATA_DIR, 'workspace.json'),
      JSON.stringify(stateFromAnotherBundle, null, 2),
      'utf8',
    )

    expect((await readState()).projects.map((project) => project.id)).toContain('prj_video_demo')
  })

  it('refreshes the active scenario when another route bundle rewrites its marker file', async () => {
    await resetStore('authenticated-empty')
    expect(await activeScenarioId()).toBe('authenticated-empty')

    const marker = path.join(DATA_DIR, 'scenario.json')
    const temporary = `${marker}.foreign-bundle.tmp`
    await fs.writeFile(temporary, JSON.stringify({ scenarioId: 'video-running' }), 'utf8')
    await fs.rename(temporary, marker)

    expect(await activeScenarioId()).toBe('video-running')
    const restored = await resetStore()
    expect(restored.projects.map((project) => project.id)).toContain('prj_video_demo')
    expect(restored.jobs[0].status).toBe('running')
  })

  it('resets companion fixture stores at the same lifecycle boundary', async () => {
    await resetStore('authenticated-populated')
    writeHomeCreationContext({
      ...CREATION_CONTEXT_EMPTY_FIXTURE,
      generationMode: 'auto',
      model: { id: 'fixture-model', label: 'Fixture model', media: 'video', catalogVersion: 'test' },
    })
    heartbeat('cvs_lifecycle', {
      participantId: 'lifecycle-user',
      name: '生命周期用户',
      color: '#4c7ef3',
      cursor: { x: 1, y: 2 },
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    await updateLocalPreferences({ theme: 'light', aiWatermark: false })
    await updateLocalSession({ action: 'signOut', returnTo: '/' })

    await resetStore('authenticated-empty')

    expect(readHomeCreationContext()).toEqual(CREATION_CONTEXT_EMPTY_FIXTURE)
    expect(presenceDebug()).toMatchObject({ rooms: 0, timers: 0 })
    await expect(readLocalPreferences()).resolves.toEqual(DEFAULT_LOCAL_PREFERENCES)
    await expect(readLocalIdentity()).resolves.toMatchObject({ session: { status: 'authenticated' } })
  })

  it('keeps a reset final when an older bundle finishes its queued write late', async () => {
    await resetStore('authenticated-empty')
    let entered!: () => void
    const enteredWrite = new Promise<void>((resolve) => { entered = resolve })
    let release!: () => void
    const releaseWrite = new Promise<void>((resolve) => { release = resolve })

    // This reference models one Next route graph. It has its own module-local
    // promise chain, so the assertion exercises the on-disk lock rather than
    // merely the current module's queue.
    const staleWrite = withState(async (state) => {
      entered()
      await releaseWrite
      state.projects.push({
        id: 'prj_late_bundle',
        spaceId: 'sp_default',
        folderId: null,
        name: '迟到写入',
        canvasIds: [],
        coverUrl: null,
        createdAt: '2026-09-04T00:00:00.000Z',
        updatedAt: '2026-09-04T00:00:00.000Z',
      })
    })
    await enteredWrite

    vi.resetModules()
    const foreignBundle = await import('@/server/store')
    const reset = foreignBundle.resetStore('video-running')
    release()
    await Promise.all([staleWrite, reset])

    const finalState = await foreignBundle.readState()
    expect(await foreignBundle.activeScenarioId()).toBe('video-running')
    expect(finalState.projects.map((project) => project.id)).toContain('prj_video_demo')
    expect(finalState.projects.map((project) => project.id)).not.toContain('prj_late_bundle')
  })
})
