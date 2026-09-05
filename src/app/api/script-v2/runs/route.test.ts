import { afterEach, describe, expect, it } from 'vitest'

import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { ScriptV2RunResponseSchema } from '@/contracts/script-v2'
import { __resetScriptV2Runs } from '@/server/script-v2'
import { POST } from './route'

const url = 'http://localhost/api/script-v2/runs'

function post(body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function generateFullRequest(idempotencyKey = 'script-route-create-replay') {
  return {
    idempotencyKey,
    canvasId: 'can_video_main',
    nodeId: 'node_script_v2',
    operation: 'generate-full' as const,
    input: {
      storyText: '雨夜车站，主角在列车抵达前作出选择。',
      entry: 'screenplay' as const,
      modelId: 'gvlm-3.1',
    },
  }
}

describe.sequential('POST /api/script-v2/runs route smoke', () => {
  afterEach(() => {
    __resetScriptV2Runs()
  })

  it('creates a typed queued run and replays the same idempotency input exactly', async () => {
    const request = generateFullRequest()
    const createdResponse = await POST(post(request))
    const created = ScriptV2RunResponseSchema.parse(await createdResponse.json())
    const replayResponse = await POST(post(request))
    const replay = ScriptV2RunResponseSchema.parse(await replayResponse.json())

    expect(createdResponse.status).toBe(200)
    expect(created.run).toMatchObject({
      status: 'queued',
      attempt: 1,
      progress: 0,
      result: null,
      error: null,
      quote: { operation: 'generate-full' },
    })
    expect(replayResponse.status).toBe(200)
    expect(replay).toEqual(created)
  })

  it('rejects a reused key with a distinct Script V2 input and malformed payloads', async () => {
    const created = await POST(post(generateFullRequest('script-route-conflict')))
    expect(created.status).toBe(200)

    const conflictingRequest = generateFullRequest('script-route-conflict')
    conflictingRequest.input.storyText = '不同脚本输入不得共享幂等键。'
    const conflictingResponse = await POST(post(conflictingRequest))
    const conflicting = LocalErrorEnvelopeSchema.parse(await conflictingResponse.json())
    expect(conflictingResponse.status).toBe(409)
    expect(conflicting).toMatchObject({ error: { code: 'REVISION_CONFLICT', message: expect.stringContaining('idempotencyKey') } })

    const malformedResponse = await POST(post({ operation: 'generate-full' }))
    const malformed = LocalErrorEnvelopeSchema.parse(await malformedResponse.json())
    expect(malformedResponse.status).toBe(422)
    expect(malformed.error.code).toBe('INVALID_INPUT')
  })
})
