import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { readState, resetStore } from '@/server/store'
import { POST } from './route'

const ResetResponseSchema = z.object({
  ok: z.literal(true),
  projects: z.number().int().nonnegative(),
}).strict()

describe.sequential('POST /api/dev/reset', () => {
  beforeEach(async () => {
    vi.unstubAllEnvs()
    await resetStore('authenticated-populated')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('resets the active fixture and reports a schema-valid persisted project count', async () => {
    const before = await readState()
    expect(before.projects.length).toBeGreaterThan(0)

    const response = await POST()
    const body = ResetResponseSchema.parse(await response.json())
    const after = await readState()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(body).toEqual({ ok: true, projects: after.projects.length })
    expect(after.projects.length).toBe(before.projects.length)
  })

  it('refuses the destructive endpoint in production without resetting the active fixture', async () => {
    const before = await readState()
    vi.stubEnv('NODE_ENV', 'production')

    const response = await POST()
    const body = LocalErrorEnvelopeSchema.parse(await response.json())
    const after = await readState()

    expect(response.status).toBe(403)
    expect(body.error).toMatchObject({ code: 'FORBIDDEN', message: '该接口仅在开发环境可用' })
    expect(after).toEqual(before)
  })
})
