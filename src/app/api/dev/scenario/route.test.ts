import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { buildScenario } from '@/mocks/scenarios/build'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/dev/scenario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe.sequential('/api/dev/scenario', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('switches to a named scenario and reports deterministic state counts', async () => {
    const response = await POST(postRequest({ scenarioId: 'video-succeeded' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      scenario: { id: 'video-succeeded', seedVersion: 1 },
      state: { projects: 3, canvases: 3, jobs: 2, assets: 1 },
    })

    const current = await GET()
    expect(await current.json()).toEqual(body)
  })

  it('rejects unknown or missing scenario IDs', async () => {
    const unknown = await POST(postRequest({ scenarioId: 'not-a-scenario' }))
    const missing = await POST(postRequest({}))

    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toMatchObject({ error: { code: 'INVALID_INPUT', message: '未知的 mock scenario' }, requestId: expect.any(String) })
    expect(missing.status).toBe(400)
  })

  it('refuses both read and mutation endpoints in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const read = await GET()
    const write = await POST(postRequest({ scenarioId: 'video-running' }))

    expect(read.status).toBe(403)
    expect(write.status).toBe(403)
    expect(await read.json()).toMatchObject({ error: { code: 'FORBIDDEN', message: '该接口仅在开发环境可用' }, requestId: expect.any(String) })
  })

  it('never combines a scenario marker with another generation of workspace data', async () => {
    const ids = ['authenticated-empty', 'video-running', 'video-failed', 'authenticated-populated'] as const
    const responses = await Promise.all(
      Array.from({ length: 24 }, (_, index) => {
        const scenarioId = ids[index % ids.length]
        return index % 2 === 0 ? POST(postRequest({ scenarioId })) : GET()
      }),
    )

    for (const response of responses) {
      expect(response.status).toBe(200)
      const body = await response.json()
      const expected = buildScenario(body.scenario.id)
      expect(body.state).toEqual({
        projects: expected.projects.length,
        canvases: expected.canvases.length,
        jobs: expected.jobs.length,
        assets: expected.assets.length,
      })
    }
  })
})
