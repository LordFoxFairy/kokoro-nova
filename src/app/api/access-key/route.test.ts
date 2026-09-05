import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { AccessKeyResponseSchema } from '@/contracts/account-external'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { updateLocalSession } from '@/server/identity'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'

describe.sequential('local Access Key route', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await updateLocalSession({ action: 'signIn', returnTo: '/' })
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await updateLocalSession({ action: 'signIn', returnTo: '/' })
  })

  it('validates command input and only returns a masked projection', async () => {
    const before = AccessKeyResponseSchema.parse(await (await GET()).json())
    const created = AccessKeyResponseSchema.parse(await (await POST(new Request('http://localhost/api/access-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', idempotencyKey: 'route-create-1' }),
    }))).json())

    expect(before.key.state).toBe('not-created')
    expect(created.key).toMatchObject({ state: 'active', generation: 1 })
    expect(JSON.stringify(created)).not.toContain('sk-')
  })
})
