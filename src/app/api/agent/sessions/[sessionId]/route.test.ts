import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AgentMessagesResponseSchema,
  AgentSessionDetailResponseSchema,
  AgentSessionSchema,
  ListAgentSessionsResponseSchema,
  DeleteAgentSessionResponseSchema,
} from '@/contracts/agent'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET as listSessions, POST as createSession } from '../route'
import { PATCH as resolveMessage, POST as sendMessage } from './messages/route'
import { DELETE, GET, PATCH } from './route'

const params = (sessionId: string) => ({ params: Promise.resolve({ sessionId }) })
const jsonRequest = (url: string, method: 'POST' | 'PATCH', body: unknown) => new Request(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

async function createBoundSession() {
  const response = await createSession(jsonRequest('http://localhost/api/agent/sessions', 'POST', {
    projectId: 'prj_video_demo',
    canvasId: 'can_video_main',
  }))
  expect(response.status).toBe(200)
  return AgentSessionSchema.parse(await response.json())
}

describe.sequential('Agent session detail route smoke', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('preserves ordered message sequence through afterSeq cursor reads and ask-human resolution', async () => {
    const session = await createBoundSession()
    const initialTurn = await sendMessage(
      jsonRequest(`http://localhost/api/agent/sessions/${session.id}/messages`, 'POST', { text: '做个视频' }),
      params(session.id),
    )
    const initial = AgentMessagesResponseSchema.parse(await initialTurn.json())
    const question = initial.messages.find((message) => message.payload?.kind === 'ask_human')

    expect(initialTurn.status).toBe(200)
    expect(initial.session.seq).toBe(2)
    expect(initial.messages.map((message) => message.seq)).toEqual([1, 2])
    expect(question?.payload).toMatchObject({ kind: 'ask_human', answered: false })

    const firstRead = await GET(new Request(`http://localhost/api/agent/sessions/${session.id}?afterSeq=0`), params(session.id))
    const firstBody = AgentSessionDetailResponseSchema.parse(await firstRead.json())
    expect(firstRead.status).toBe(200)
    expect(firstBody.messages).toEqual(initial.messages)

    const cursorRead = await GET(new Request(`http://localhost/api/agent/sessions/${session.id}?afterSeq=1`), params(session.id))
    const cursorBody = AgentSessionDetailResponseSchema.parse(await cursorRead.json())
    expect(cursorRead.status).toBe(200)
    expect(cursorBody.messages.map((message) => message.seq)).toEqual([2])
    expect(cursorBody.messages[0].id).toBe(question!.id)

    const resolvedResponse = await resolveMessage(
      jsonRequest(`http://localhost/api/agent/sessions/${session.id}/messages`, 'PATCH', {
        messageId: question!.id,
        action: 'answer',
        answer: '制作一条介绍本地产品的城市夜景宣传视频，包含海报、镜头和旁白。',
      }),
      params(session.id),
    )
    const resolved = AgentMessagesResponseSchema.parse(await resolvedResponse.json())
    expect(resolvedResponse.status).toBe(200)
    expect(resolved.messages[0]).toMatchObject({
      id: question!.id,
      payload: { kind: 'ask_human', answered: true, answer: '制作一条介绍本地产品的城市夜景宣传视频，包含海报、镜头和旁白。' },
    })
    expect(resolved.messages.slice(1).map((message) => message.seq)).toEqual(
      expect.arrayContaining([3, 4]),
    )
    expect(resolved.messages.slice(1).every((message) => message.seq > question!.seq)).toBe(true)
    expect(resolved.session.seq).toBeGreaterThan(question!.seq)

    const followUpRead = await GET(
      new Request(`http://localhost/api/agent/sessions/${session.id}?afterSeq=${question!.seq}`),
      params(session.id),
    )
    const followUp = AgentSessionDetailResponseSchema.parse(await followUpRead.json())
    expect(followUpRead.status).toBe(200)
    expect(followUp.messages).toEqual(resolved.messages.slice(1))
  })

  it('updates a populated session, normalizes missing paths, and removes the complete session projection', async () => {
    const session = await createBoundSession()
    const sent = await sendMessage(
      jsonRequest(`http://localhost/api/agent/sessions/${session.id}/messages`, 'POST', {
        text: '制作一个有镜头和海报的完整视频方案',
      }),
      params(session.id),
    )
    expect(sent.status).toBe(200)

    const updatedResponse = await PATCH(
      jsonRequest(`http://localhost/api/agent/sessions/${session.id}`, 'PATCH', {
        title: '城市夜景方案',
        shared: true,
        generationMode: 'auto',
      }),
      params(session.id),
    )
    const updated = AgentSessionSchema.parse(await updatedResponse.json())
    expect(updatedResponse.status).toBe(200)
    expect(updated).toMatchObject({
      id: session.id,
      title: '城市夜景方案',
      shared: true,
      settings: { generationMode: 'auto' },
    })

    const missingRead = await GET(new Request('http://localhost/api/agent/sessions/missing'), params('missing'))
    expect(missingRead.status).toBe(404)
    expect(LocalErrorEnvelopeSchema.parse(await missingRead.json())).toMatchObject({
      error: { code: 'NOT_FOUND', message: '会话不存在' },
      requestId: expect.any(String),
    })

    const missingSend = await sendMessage(
      jsonRequest('http://localhost/api/agent/sessions/missing/messages', 'POST', { text: '不会写入' }),
      params('missing'),
    )
    expect(missingSend.status).toBe(404)
    expect(LocalErrorEnvelopeSchema.parse(await missingSend.json())).toMatchObject({
      error: { code: 'NOT_FOUND', message: '会话不存在' },
      requestId: expect.any(String),
    })

    const deletedResponse = await DELETE(
      new Request(`http://localhost/api/agent/sessions/${session.id}`, { method: 'DELETE' }),
      params(session.id),
    )
    expect(deletedResponse.status).toBe(200)
    expect(DeleteAgentSessionResponseSchema.parse(await deletedResponse.json())).toEqual({ deleted: session.id })

    const detailAfterDelete = await GET(new Request(`http://localhost/api/agent/sessions/${session.id}`), params(session.id))
    expect(detailAfterDelete.status).toBe(404)
    expect(LocalErrorEnvelopeSchema.parse(await detailAfterDelete.json())).toMatchObject({ error: { code: 'NOT_FOUND' } })

    const listAfterDelete = await listSessions(new Request('http://localhost/api/agent/sessions'))
    const listed = ListAgentSessionsResponseSchema.parse(await listAfterDelete.json())
    expect(listAfterDelete.status).toBe(200)
    expect(listed.sessions.map((item) => item.id)).not.toContain(session.id)
  })
})
