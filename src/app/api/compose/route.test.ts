import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ComposeTaskResponseSchema } from '@/contracts/compose'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import {
  __resetComposeTasksForTests,
  __setComposeRendererForTests,
  type ComposeResult,
} from '@/server/compose'
import { resetStore } from '@/server/store'
import { GET as getTask, POST as transitionTask } from './[taskId]/route'
import { POST as createTask } from './route'

const params = (taskId: string) => ({ params: Promise.resolve({ taskId }) })
const taskUrl = (taskId: string) => `http://localhost/api/compose/${taskId}`
const request = (url: string, body: unknown) => new Request(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function composeRequest() {
  return {
    clips: [{
      url: '/api/media/fixtures/city-night.mp4',
      inPoint: 0,
      outPoint: 1,
      speed: 1,
      muted: false,
      transitionAfter: null,
      transitionDurationSeconds: null,
    }],
    audioTracks: [],
    subtitles: [],
  }
}

async function waitForTaskStatus(
  taskId: string,
  status: 'rendering' | 'cancelled',
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await getTask(new Request(taskUrl(taskId)), params(taskId))
    expect(response.status).toBe(200)
    const body = ComposeTaskResponseSchema.parse(await response.json())
    if (body.task.status === status) return body.task
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`compose task ${taskId} did not reach ${status}`)
}

describe.sequential('compose route smoke', () => {
  beforeEach(async () => {
    await resetStore('authenticated-populated')
    await __resetComposeTasksForTests()
  })

  afterEach(async () => {
    __setComposeRendererForTests(null)
    await __resetComposeTasksForTests()
  })

  afterAll(async () => {
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('creates a schema-valid queued task, cancels it idempotently, and preserves the terminal projection', async () => {
    let releaseRender!: () => void
    const renderBlocked = new Promise<void>((resolve) => { releaseRender = resolve })
    __setComposeRendererForTests(async (): Promise<ComposeResult> => {
      await renderBlocked
      return { ok: false, code: 'render_failed', reason: 'test renderer released after cancellation' }
    })

    const createdResponse = await createTask(request('http://localhost/api/compose', composeRequest()))
    const created = ComposeTaskResponseSchema.parse(await createdResponse.json())

    expect(createdResponse.status).toBe(200)
    expect(created.task).toMatchObject({
      id: expect.stringMatching(/^compose_task_/),
      status: 'queued',
      artifact: null,
      assetId: null,
      subtitleMode: null,
      failure: null,
    })

    await waitForTaskStatus(created.task.id, 'rendering')

    const cancelledResponse = await transitionTask(
      request(taskUrl(created.task.id), { action: 'cancel' }),
      params(created.task.id),
    )
    const cancelled = ComposeTaskResponseSchema.parse(await cancelledResponse.json())
    expect(cancelledResponse.status).toBe(200)
    expect(cancelled.task).toMatchObject({
      id: created.task.id,
      status: 'cancelled',
      artifact: null,
      assetId: null,
      subtitleMode: null,
      notes: [],
      failure: null,
    })

    const replayResponse = await transitionTask(
      request(taskUrl(created.task.id), { action: 'cancel' }),
      params(created.task.id),
    )
    const replay = ComposeTaskResponseSchema.parse(await replayResponse.json())
    expect(replayResponse.status).toBe(200)
    expect(replay.task).toEqual(cancelled.task)

    releaseRender()
    const persisted = await waitForTaskStatus(created.task.id, 'cancelled')
    expect(persisted).toEqual(cancelled.task)
  })

  it('normalizes invalid compose input and missing-task actions as ErrorResponse envelopes', async () => {
    const malformed = await createTask(request('http://localhost/api/compose', { clips: [] }))
    const malformedBody = LocalErrorEnvelopeSchema.parse(await malformed.json())
    expect(malformed.status).toBe(400)
    expect(malformedBody).toMatchObject({
      error: { code: 'INVALID_INPUT', message: expect.stringContaining('clips') },
      requestId: expect.any(String),
    })

    const missing = await transitionTask(
      request(taskUrl('compose_task_missing'), { action: 'retry' }),
      params('compose_task_missing'),
    )
    const missingBody = LocalErrorEnvelopeSchema.parse(await missing.json())
    expect(missing.status).toBe(404)
    expect(missingBody).toMatchObject({
      error: { code: 'NOT_FOUND', message: '视频合成任务不存在' },
      requestId: expect.any(String),
    })
  })
})
