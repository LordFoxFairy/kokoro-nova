import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { CreateTeamInviteResponseSchema } from '@/contracts/team'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { updateLocalSession } from '@/server/identity'
import { resetStore } from '@/server/store'
import { POST } from './route'

const url = 'http://localhost/api/team/invites'

function invitationRequest(body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe.sequential('local team invitation route', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await updateLocalSession({ action: 'signIn', returnTo: '/' })
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await updateLocalSession({ action: 'signIn', returnTo: '/' })
  })

  it('returns the exact deterministic response for a valid command and its idempotent replay', async () => {
    const body = { inviteeAlias: '本地协作者', role: 'member', idempotencyKey: 'invite-route-replay' }
    const created = await POST(invitationRequest(body))
    const replay = await POST(invitationRequest(body))

    const createdBody = CreateTeamInviteResponseSchema.parse(await created.json())
    const replayBody = CreateTeamInviteResponseSchema.parse(await replay.json())
    expect(created.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(replayBody).toEqual(createdBody)
  })

  it('returns the documented 409 envelope when a key is reused for different input', async () => {
    await POST(invitationRequest({ inviteeAlias: '本地协作者', role: 'member', idempotencyKey: 'invite-route-conflict' }))
    const conflict = await POST(invitationRequest({ inviteeAlias: '另一位协作者', role: 'member', idempotencyKey: 'invite-route-conflict' }))
    const body = LocalErrorEnvelopeSchema.parse(await conflict.json())

    expect(conflict.status).toBe(409)
    expect(body.error).toMatchObject({ code: 'REVISION_CONFLICT', message: '同一幂等键不能用于不同命令' })
  })
})
