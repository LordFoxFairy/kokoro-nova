import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { SharedAssetsResponseSchema } from '@/contracts/team'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { POST as updateSession } from '../identity/route'
import { GET } from './route'

function sessionRequest(action: 'signIn' | 'signOut') {
  return new Request('http://localhost/api/identity', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, returnTo: '/' }),
  })
}

describe.sequential('local shared-assets fixture route', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await updateSession(sessionRequest('signIn'))
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await updateSession(sessionRequest('signIn'))
  })

  it('projects stable shared assets with explicit local permissions', async () => {
    const response = await GET()
    const body = SharedAssetsResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ state: 'ready', assets: [
      { id: 'shared_asset_city_board', permission: 'edit' },
      { id: 'shared_asset_voice_over', permission: 'view' },
    ] })
    expect(JSON.stringify(body)).not.toContain('http')
  })

  it('uses permission-denied rather than leaking team assets after local logout', async () => {
    await updateSession(sessionRequest('signOut'))
    const body = SharedAssetsResponseSchema.parse(await (await GET()).json())
    expect(body).toMatchObject({ state: 'permission-denied', assets: [] })
  })
})
