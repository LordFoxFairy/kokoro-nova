import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { PATCH as updateSession } from '@/app/api/agent/sessions/[sessionId]/route'
import { PATCH as resolveMessage, POST as sendMessage } from '@/app/api/agent/sessions/[sessionId]/messages/route'
import { POST as createSession } from '@/app/api/agent/sessions/route'
import { AgentMessagesResponseSchema, AgentSessionSchema } from '@/contracts/agent'
import type { CanvasMutation } from '@/domain/types'
import { canAutoApplyProposal } from '@/server/agent'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { readState, resetStore } from '@/server/store'

const params = (sessionId: string) => ({ params: Promise.resolve({ sessionId }) })
const jsonRequest = (url: string, method: 'POST' | 'PATCH', body: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
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

async function sendPlannableBrief(sessionId: string, text = '为本地产品制作一条包含海报和视频镜头的城市宣传片') {
  const response = await sendMessage(
    jsonRequest(`http://localhost/api/agent/sessions/${sessionId}/messages`, 'POST', { text }),
    params(sessionId),
  )
  expect(response.status).toBe(200)
  return AgentMessagesResponseSchema.parse(await response.json())
}

describe.sequential('Agent generation modes', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('keeps manual proposals pending until the user explicitly applies them', async () => {
    const session = await createBoundSession()
    const before = await readState()
    const nodeCount = before.canvases.find((canvas) => canvas.id === 'can_video_main')!.document.nodes.length

    const planned = await sendPlannableBrief(session.id)
    const proposal = planned.messages.find((message) => message.payload?.kind === 'mutation_proposal')
    expect(proposal?.payload).toMatchObject({ kind: 'mutation_proposal', status: 'pending' })
    expect(planned.messages.some((message) => message.payload?.kind === 'tool_call' && message.payload.tool === 'workflow.auto_apply')).toBe(false)
    expect((await readState()).canvases.find((canvas) => canvas.id === 'can_video_main')!.document.nodes).toHaveLength(nodeCount)

    const applied = await resolveMessage(
      jsonRequest(`http://localhost/api/agent/sessions/${session.id}/messages`, 'PATCH', { messageId: proposal!.id, action: 'apply' }),
      params(session.id),
    )
    const body = AgentMessagesResponseSchema.parse(await applied.json())
    expect(applied.status).toBe(200)
    expect(body.document?.nodes.length).toBeGreaterThan(nodeCount)
  })

  it('auto-applies an eligible local proposal and records the media failure fallback trace', async () => {
    const session = await createBoundSession()
    const updated = await updateSession(
      jsonRequest(`http://localhost/api/agent/sessions/${session.id}`, 'PATCH', { generationMode: 'auto' }),
      params(session.id),
    )
    expect(updated.status).toBe(200)

    const before = await readState()
    const nodeCount = before.canvases.find((canvas) => canvas.id === 'can_video_main')!.document.nodes.length
    const result = await sendPlannableBrief(session.id, '为本地产品制作一条视频宣传片 [fixture:media-failure]')

    expect(result.document?.nodes.length).toBeGreaterThan(nodeCount)
    expect(result.revision).toBeTypeOf('number')
    expect(result.messages.find((message) => message.payload?.kind === 'mutation_proposal')?.payload).toMatchObject({
      kind: 'mutation_proposal',
      status: 'applied',
    })
    expect(result.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ payload: expect.objectContaining({ kind: 'tool_call', tool: 'workflow.auto_apply', status: 'ok' }) }),
      expect.objectContaining({ payload: expect.objectContaining({ kind: 'tool_call', tool: 'workflow.fallback', status: 'ok' }) }),
      expect.objectContaining({ payload: expect.objectContaining({ kind: 'tool_call', tool: 'media.generate', status: 'error' }) }),
      expect.objectContaining({ role: 'assistant', content: expect.stringContaining('自动模式已应用') }),
    ]))
  })

  it('limits auto execution to bounded additive workflow mutations', () => {
    const safe: CanvasMutation[] = [{ op: 'addEdge', edge: { id: 'edge_safe', source: 'node_a', target: 'node_b', createdAt: '2026-09-04T00:00:00.000Z' } }]
    const destructive: CanvasMutation[] = [{ op: 'removeNode', nodeId: 'node_a' }]

    expect(canAutoApplyProposal(safe)).toBe(true)
    expect(canAutoApplyProposal(destructive)).toBe(false)
    expect(canAutoApplyProposal(Array.from({ length: 33 }, () => safe[0]))).toBe(false)
  })
})
