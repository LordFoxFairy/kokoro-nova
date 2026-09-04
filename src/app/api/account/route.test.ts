import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { AccountProfileResponseSchema } from '@/contracts/account'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { POST as updateSession } from '../identity/route'
import { GET } from './route'

function sessionRequest(action: 'signIn' | 'signOut') {
  return new Request('http://localhost/api/identity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, returnTo: '/' }),
  })
}

describe.sequential('GET /api/account', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await updateSession(sessionRequest('signIn'))
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await updateSession(sessionRequest('signIn'))
  })

  it('projects the persisted local session identity for logout and login', async () => {
    await updateSession(sessionRequest('signOut'))
    const signedOut = AccountProfileResponseSchema.parse(await (await GET()).json())

    expect(signedOut.identity).toMatchObject({
      displayName: '公开浏览者',
      maskedAccount: '未登录',
      avatarInitial: 'L',
    })
    expect(signedOut.wallet.availableCredits).toBe(0)
    expect(signedOut.notifications).toEqual([])

    await updateSession(sessionRequest('signIn'))
    const signedIn = AccountProfileResponseSchema.parse(await (await GET()).json())

    expect(signedIn.identity).toMatchObject({
      displayName: '微信用户cd385d',
      maskedAccount: '微信 · cd••••5d',
      uuidMasked: 'cd385d••••••9a21',
      accessKeyLabel: 'Access key',
      avatarInitial: '微',
    })
    expect(signedIn.wallet.availableCredits).toBeGreaterThan(0)
  })
})
