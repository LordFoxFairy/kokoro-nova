import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AgentSessionSchema,
  CreateAgentSessionResponseSchema,
  ListAgentSessionsResponseSchema,
} from '@/contracts/agent'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'

const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

async function createSession(input: { projectId?: string | null, canvasId?: string | null } = {}) {
  const response = await POST(jsonRequest('http://localhost/api/agent/sessions', input))
  expect(response.status).toBe(200)
  return CreateAgentSessionResponseSchema.parse(await response.json())
}

describe.sequential('Agent session collection route smoke', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('creates and lists schema-valid session projections with project filtering', async () => {
    const bound = await createSession({ projectId: 'prj_video_demo', canvasId: 'can_video_main' })
    const detached = await createSession({ projectId: 'prj_story_demo' })

    expect(AgentSessionSchema.parse(bound)).toMatchObject({
      id: expect.stringMatching(/^ses_/),
      spaceId: expect.any(String),
      projectId: 'prj_video_demo',
      canvasId: 'can_video_main',
      title: '新会话',
      seq: 0,
      shared: false,
      settings: { generationMode: 'manual', freeTurns: 3 },
    })

    const allResponse = await GET(new Request('http://localhost/api/agent/sessions'))
    const all = ListAgentSessionsResponseSchema.parse(await allResponse.json())
    expect(allResponse.status).toBe(200)
    expect(all.sessions.map((session) => session.id)).toEqual(expect.arrayContaining([bound.id, detached.id]))
    expect(all.sessions).toEqual([...all.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))

    const filteredResponse = await GET(new Request('http://localhost/api/agent/sessions?projectId=prj_video_demo'))
    const filtered = ListAgentSessionsResponseSchema.parse(await filteredResponse.json())
    expect(filteredResponse.status).toBe(200)
    expect(filtered.sessions).toContainEqual(bound)
    expect(filtered.sessions.every((session) => session.projectId === 'prj_video_demo')).toBe(true)
    expect(filtered.sessions.map((session) => session.id)).not.toContain(detached.id)
  })

  it('rejects malformed creation input with the standard 400 ErrorResponse envelope', async () => {
    const response = await POST(jsonRequest('http://localhost/api/agent/sessions', { projectId: 42 }))

    expect(response.status).toBe(400)
    expect(LocalErrorEnvelopeSchema.parse(await response.json())).toMatchObject({
      error: { code: 'INVALID_INPUT' },
      requestId: expect.stringMatching(/^req_local_/),
    })
  })
})
