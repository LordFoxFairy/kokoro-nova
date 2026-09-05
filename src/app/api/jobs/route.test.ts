import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { CreateJobResponseSchema, ListJobsResponseSchema } from '@/contracts/jobs'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { __resetGenerationRunnerForTests } from '@/server/generation/runner'
import { resetStore } from '@/server/store'
import { GET, POST } from './route'

const url = 'http://localhost/api/jobs'

function createRequest(body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe.sequential('/api/jobs collection route smoke', () => {
  beforeEach(async () => {
    __resetGenerationRunnerForTests()
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    __resetGenerationRunnerForTests()
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('creates a schema-valid confirmation-gated job and lists it through the canvas projection', async () => {
    const createdResponse = await POST(createRequest({
      canvasId: 'can_video_main',
      nodeId: 'node_video_01',
      fixture: 'pending',
    }))
    const created = CreateJobResponseSchema.parse(await createdResponse.json())

    expect(createdResponse.status).toBe(200)
    expect(created.job).toMatchObject({
      canvasId: 'can_video_main',
      nodeId: 'node_video_01',
      status: 'awaiting_confirmation',
      attempt: 0,
      progress: 0,
      artifacts: [],
      error: null,
    })

    const filteredResponse = await GET(new Request(`${url}?canvasId=can_video_main`))
    const filtered = ListJobsResponseSchema.parse(await filteredResponse.json())
    expect(filteredResponse.status).toBe(200)
    expect(filtered.jobs).toContainEqual(expect.objectContaining({ id: created.job.id }))

    const otherCanvasResponse = await GET(new Request(`${url}?canvasId=canvas_missing`))
    const otherCanvas = ListJobsResponseSchema.parse(await otherCanvasResponse.json())
    expect(otherCanvasResponse.status).toBe(200)
    expect(otherCanvas.jobs).toEqual([])
  })

  it('normalizes malformed generation requests as the documented error envelope', async () => {
    const response = await POST(createRequest({ canvasId: 'can_video_main' }))
    const body = LocalErrorEnvelopeSchema.parse(await response.json())

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: { code: 'INVALID_INPUT', message: expect.stringContaining('nodeId') },
      requestId: expect.any(String),
    })
  })
})
