import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AgentMessagesResponseSchema,
  AgentSessionSchema,
  CreateAgentSessionResponseSchema,
} from '@/contracts/agent'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { POST as createSession } from '../route'
import { GET as getSession, PATCH as updateSession } from '../[sessionId]/route'
import { PATCH as resolveMessage, POST as sendMessage } from '../[sessionId]/messages/route'

const params = (sessionId: string) => ({ params: Promise.resolve({ sessionId }) })

const jsonRequest = (url: string, method: 'POST' | 'PATCH', body: unknown) => new Request(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

async function createEmptySession() {
  const response = await createSession(jsonRequest('http://localhost/api/agent/sessions', 'POST', {}))
  expect(response.status).toBe(200)
  return CreateAgentSessionResponseSchema.parse(await response.json())
}

async function expectErrorEnvelope(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(response.headers.get('content-type')).toContain('application/json')
  return LocalErrorEnvelopeSchema.parse(await response.json())
}

describe.sequential('RT-03 agent runtime error-envelope contracts', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('returns a schema-valid message projection for a real HTTP handler invocation', async () => {
    const session = await createEmptySession()
    const response = await sendMessage(
      jsonRequest(`http://localhost/api/agent/sessions/${session.id}/messages`, 'POST', { text: '做个视频' }),
      params(session.id),
    )
    const body = AgentMessagesResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(AgentSessionSchema.parse(body.session)).toMatchObject({ id: session.id, seq: 2 })
    expect(body.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(body.messages.at(-1)?.payload).toMatchObject({ kind: 'ask_human', answered: false })
  })

  it('normalizes malformed lifecycle inputs and missing resources to ErrorResponse', async () => {
    const session = await createEmptySession()

    const emptyText = await expectErrorEnvelope(
      await sendMessage(
        jsonRequest(`http://localhost/api/agent/sessions/${session.id}/messages`, 'POST', { text: '   ' }),
        params(session.id),
      ),
      400,
      'INVALID_INPUT',
    )
    expect(emptyText).toMatchObject({
      error: { code: 'INVALID_INPUT' },
      requestId: expect.stringMatching(/^req_local_/),
    })

    const invalidCursor = await expectErrorEnvelope(
      await getSession(
        new Request(`http://localhost/api/agent/sessions/${session.id}?afterSeq=-1`),
        params(session.id),
      ),
      400,
      'INVALID_INPUT',
    )
    expect(invalidCursor.error.message).toBe('afterSeq 必须是非负整数')

    const emptyShare = await expectErrorEnvelope(
      await updateSession(
        jsonRequest(`http://localhost/api/agent/sessions/${session.id}`, 'PATCH', { shared: true }),
        params(session.id),
      ),
      400,
      'INVALID_INPUT',
    )
    expect(emptyShare.error.message).toBe('空会话不能分享')

    const missingMessage = await expectErrorEnvelope(
      await resolveMessage(
        jsonRequest(`http://localhost/api/agent/sessions/${session.id}/messages`, 'PATCH', {
          messageId: 'msg_missing',
          action: 'apply',
        }),
        params(session.id),
      ),
      404,
      'NOT_FOUND',
    )
    expect(missingMessage.error.message).toBe('消息不存在或没有可处理的内容')
  })
})
