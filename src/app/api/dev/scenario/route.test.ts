import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
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
      state: { projects: 1, canvases: 1, jobs: 2, assets: 1 },
    })

    const current = await GET()
    expect(await current.json()).toEqual(body)
  })

  it('rejects unknown or missing scenario IDs', async () => {
    const unknown = await POST(postRequest({ scenarioId: 'not-a-scenario' }))
    const missing = await POST(postRequest({}))

    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({ error: '未知的 mock scenario' })
    expect(missing.status).toBe(400)
  })

  it('refuses both read and mutation endpoints in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const read = await GET()
    const write = await POST(postRequest({ scenarioId: 'video-running' }))

    expect(read.status).toBe(403)
    expect(write.status).toBe(403)
    expect(await read.json()).toEqual({ error: '该接口仅在开发环境可用' })
  })
})
