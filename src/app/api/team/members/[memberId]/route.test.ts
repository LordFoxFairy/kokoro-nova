import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { TeamMemberUpdateResponseSchema } from '@/contracts/team'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { updateLocalSession } from '@/server/identity'
import { resetStore } from '@/server/store'
import { PATCH } from './route'

function memberRequest(body: unknown) {
  return new Request('http://localhost/api/team/members/member_liu', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patch(memberId: string, body: unknown) {
  return PATCH(memberRequest(body), { params: Promise.resolve({ memberId }) })
}

describe.sequential('local team member route', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await updateLocalSession({ action: 'signIn', returnTo: '/' })
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
    await updateLocalSession({ action: 'signIn', returnTo: '/' })
  })

  it('updates a non-owner and replays the exact typed response', async () => {
    const body = { role: 'member', idempotencyKey: 'member-route-replay' }
    const updated = await patch('member_liu', body)
    const replay = await patch('member_liu', body)

    const updatedBody = TeamMemberUpdateResponseSchema.parse(await updated.json())
    const replayBody = TeamMemberUpdateResponseSchema.parse(await replay.json())
    expect(updated.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(replayBody).toEqual(updatedBody)
  })

  it.each([
    ['member_local_cd385d', { role: 'member', idempotencyKey: 'member-route-owner' }, 403, 'FORBIDDEN', '所有者角色不可通过成员更新命令修改'],
    ['member_unknown', { role: 'member', idempotencyKey: 'member-route-missing' }, 404, 'NOT_FOUND', '本地团队成员不存在'],
  ])('returns the documented error envelope for %s', async (memberId, body, status, code, message) => {
    const response = await patch(memberId, body)
    const payload = LocalErrorEnvelopeSchema.parse(await response.json())

    expect(response.status).toBe(status)
    expect(payload.error).toMatchObject({ code, message })
  })

  it('returns 409 when a member command key is reused for a different role', async () => {
    await patch('member_liu', { role: 'member', idempotencyKey: 'member-route-conflict' })
    const conflict = await patch('member_liu', { role: 'admin', idempotencyKey: 'member-route-conflict' })
    const payload = LocalErrorEnvelopeSchema.parse(await conflict.json())

    expect(conflict.status).toBe(409)
    expect(payload.error).toMatchObject({ code: 'REVISION_CONFLICT', message: '同一幂等键不能用于不同命令' })
  })
})
