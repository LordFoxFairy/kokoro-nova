import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { TeamResponseSchema } from '@/contracts/team'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET } from './route'

describe.sequential('local team fixture route', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('projects the deterministic owner team without account credentials', async () => {
    const response = await GET()
    const body = TeamResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ state: 'ready', team: { name: 'Kokoro 创作组', role: 'owner' } })
    expect(JSON.stringify(body)).not.toContain('sk-')
  })

  it('returns a typed empty team projection for the empty fixture scenario', async () => {
    await resetStore('authenticated-empty')
    const body = TeamResponseSchema.parse(await (await GET()).json())
    expect(body).toMatchObject({ state: 'empty', team: null })
  })
})
