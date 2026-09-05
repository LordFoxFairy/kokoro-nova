import { afterEach, describe, expect, it } from 'vitest'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { ScriptV2RunResponseSchema } from '@/contracts/script-v2'
import { __resetScriptV2Runs } from '@/server/script-v2'
import { POST as createRun } from '../route'
import { GET, POST } from './route'

const params = (runId: string) => ({ params: Promise.resolve({ runId }) })
const runUrl = (runId: string) => `http://localhost/api/script-v2/runs/${runId}`

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function createQueuedRun(key = 'script-route-transition') {
  const response = await createRun(post('http://localhost/api/script-v2/runs', {
    idempotencyKey: key,
    canvasId: 'can_video_main',
    nodeId: 'node_script_v2',
    operation: 'generate-full',
    input: {
      storyText: '港口晨雾里，信使把最后一封信交给船长。',
      entry: 'screenplay',
      modelId: 'gvlm-3.1',
    },
  }))
  expect(response.status).toBe(200)
  return ScriptV2RunResponseSchema.parse(await response.json()).run
}

describe.sequential('/api/script-v2/runs/[runId] route smoke', () => {
  afterEach(() => {
    __resetScriptV2Runs()
  })

  it('advances queued runs through typed polling, preserves cancel replay, and retries as a new attempt', async () => {
    const queued = await createQueuedRun()

    const runningResponse = await GET(new Request(runUrl(queued.id)), params(queued.id))
    const running = ScriptV2RunResponseSchema.parse(await runningResponse.json())
    expect(runningResponse.status).toBe(200)
    expect(running.run).toMatchObject({ id: queued.id, status: 'running', attempt: 1, progress: 48, result: null })

    const cancelledResponse = await POST(post(runUrl(queued.id), { action: 'cancel' }), params(queued.id))
    const cancelled = ScriptV2RunResponseSchema.parse(await cancelledResponse.json())
    expect(cancelledResponse.status).toBe(200)
    expect(cancelled.run).toMatchObject({ id: queued.id, status: 'cancelled', attempt: 1, progress: 48, result: null })

    const cancelReplayResponse = await POST(post(runUrl(queued.id), { action: 'cancel' }), params(queued.id))
    const cancelReplay = ScriptV2RunResponseSchema.parse(await cancelReplayResponse.json())
    expect(cancelReplayResponse.status).toBe(200)
    expect(cancelReplay).toEqual(cancelled)

    const retryResponse = await POST(post(runUrl(queued.id), { action: 'retry' }), params(queued.id))
    const retry = ScriptV2RunResponseSchema.parse(await retryResponse.json())
    expect(retryResponse.status).toBe(200)
    expect(retry.run).toMatchObject({ id: queued.id, status: 'queued', attempt: 2, progress: 0, result: null, error: null })
  })

  it('normalizes missing, invalid, and terminal-state conflict transitions', async () => {
    const missingResponse = await GET(new Request(runUrl('run_missing')), params('run_missing'))
    const missing = LocalErrorEnvelopeSchema.parse(await missingResponse.json())
    expect(missingResponse.status).toBe(404)
    expect(missing).toMatchObject({ error: { code: 'NOT_FOUND', message: 'Script V2 任务不存在' } })

    const queued = await createQueuedRun('script-route-terminal-conflict')
    const firstPoll = await GET(new Request(runUrl(queued.id)), params(queued.id))
    expect(firstPoll.status).toBe(200)
    const succeededResponse = await GET(new Request(runUrl(queued.id)), params(queued.id))
    const succeeded = ScriptV2RunResponseSchema.parse(await succeededResponse.json())
    expect(succeededResponse.status).toBe(200)
    expect(succeeded.run).toMatchObject({ status: 'succeeded', progress: 100, result: { operation: 'generate-full' } })

    const conflictResponse = await POST(post(runUrl(queued.id), { action: 'cancel' }), params(queued.id))
    const conflict = LocalErrorEnvelopeSchema.parse(await conflictResponse.json())
    expect(conflictResponse.status).toBe(409)
    expect(conflict).toMatchObject({ error: { code: 'REVISION_CONFLICT', message: expect.stringContaining('不能取消') } })

    const malformedResponse = await POST(post(runUrl(queued.id), { action: 'pause' }), params(queued.id))
    const malformed = LocalErrorEnvelopeSchema.parse(await malformedResponse.json())
    expect(malformedResponse.status).toBe(422)
    expect(malformed.error.code).toBe('INVALID_INPUT')
  })
})
