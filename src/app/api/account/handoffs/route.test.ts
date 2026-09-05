import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { AccountExternalHandoffsResponseSchema } from '@/contracts/account-external'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { POST as updateSession } from '../../identity/route'
import { GET } from './route'

function sessionRequest(action: 'signIn' | 'signOut') {
  return new Request('http://localhost/api/identity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, returnTo: '/account' }),
  })
}

describe.sequential('GET /api/account/handoffs', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await updateSession(sessionRequest('signIn'))
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await updateSession(sessionRequest('signIn'))
  })

  it('returns the typed, non-executing external handoff projection for an authenticated local display session', async () => {
    const response = await GET()
    const body = AccountExternalHandoffsResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(body).toMatchObject({
      state: 'ready',
      subscription: { owner: 'billing', state: 'handoff-ready', action: 'open-subscription' },
      invoices: { owner: 'invoice', state: 'empty', action: 'view-invoices' },
      modelMarket: { owner: 'model-market', state: 'handoff-ready', action: 'browse-model-market' },
    })
  })

  it('keeps the same response shape while projecting the anonymous permission boundary', async () => {
    await updateSession(sessionRequest('signOut'))

    const response = await GET()
    const body = AccountExternalHandoffsResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      state: 'permission-denied',
      subscription: { state: 'authentication-required', action: null, actionLabel: '登录后继续' },
      invoices: { state: 'authentication-required', action: null },
      modelMarket: { state: 'authentication-required', action: null },
    })
  })
})
