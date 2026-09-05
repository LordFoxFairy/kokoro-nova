import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ComposeResponseSchema, ComposeTaskResponseSchema } from '@/contracts/compose'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import {
  __resetComposeTasksForTests,
  __setComposeRendererForTests,
  type ComposeResult,
} from '@/server/compose'
import { readState, resetStore } from '@/server/store'
import { GET as getTask, POST as transitionTask } from './[taskId]/route'
import { POST as createTask } from './route'

const params = (taskId: string) => ({ params: Promise.resolve({ taskId }) })
const taskUrl = (taskId: string) => `http://localhost/api/compose/${taskId}`
const scopedTaskUrl = (taskId: string, projectId: string, canvasId: string) =>
  `${taskUrl(taskId)}?projectId=${encodeURIComponent(projectId)}&canvasId=${encodeURIComponent(canvasId)}`
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
  status: 'rendering' | 'succeeded' | 'failed' | 'cancelled',
  scope?: { projectId: string; canvasId: string },
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await getTask(
      new Request(scope ? scopedTaskUrl(taskId, scope.projectId, scope.canvasId) : taskUrl(taskId)),
      params(taskId),
    )
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

  it('projects a succeeded task with a schema-valid artifact contract', async () => {
    __setComposeRendererForTests(async (_spec, outputDir): Promise<ComposeResult> => ({
      ok: true,
      outputPath: `${outputDir}/composite.mp4`,
      posterPath: null,
      durationSeconds: 1,
      width: 320,
      height: 180,
      byteSize: 12,
      subtitleMode: 'none',
      notes: ['deterministic fixture render'],
    }))

    const createdResponse = await createTask(request('http://localhost/api/compose', composeRequest()))
    const created = ComposeTaskResponseSchema.parse(await createdResponse.json())
    const succeeded = await waitForTaskStatus(created.task.id, 'succeeded')

    const terminal = ComposeTaskResponseSchema.parse({ task: succeeded })
    const response = ComposeResponseSchema.parse({
      artifact: terminal.task.artifact,
      assetId: terminal.task.assetId,
      subtitleMode: terminal.task.subtitleMode,
      notes: terminal.task.notes,
    })
    expect(response).toMatchObject({
      artifact: { kind: 'video', assetId: response.assetId },
      assetId: expect.stringMatching(/^ast_/),
      subtitleMode: 'none',
      notes: ['deterministic fixture render'],
    })
  })

  it('exposes renderer failure and retries the same task to succeeded', async () => {
    let shouldFail = true
    __setComposeRendererForTests(async (_spec, outputDir): Promise<ComposeResult> => {
      if (shouldFail) return { ok: false, code: 'render_failed', reason: 'deterministic renderer failure' }
      return {
        ok: true,
        outputPath: `${outputDir}/composite.mp4`,
        posterPath: null,
        durationSeconds: 1,
        width: 320,
        height: 180,
        byteSize: 12,
        subtitleMode: 'none',
        notes: [],
      }
    })

    const createdResponse = await createTask(request('http://localhost/api/compose', composeRequest()))
    const created = ComposeTaskResponseSchema.parse(await createdResponse.json())
    const failed = await waitForTaskStatus(created.task.id, 'failed')
    expect(failed).toMatchObject({
      id: created.task.id,
      status: 'failed',
      artifact: null,
      assetId: null,
      subtitleMode: null,
      notes: [],
      failure: 'deterministic renderer failure',
    })

    shouldFail = false
    const retryResponse = await transitionTask(
      request(taskUrl(created.task.id), { action: 'retry' }),
      params(created.task.id),
    )
    const retry = ComposeTaskResponseSchema.parse(await retryResponse.json())
    expect(retryResponse.status).toBe(200)
    expect(retry.task).toMatchObject({ id: created.task.id, status: 'queued', failure: null })

    const succeeded = await waitForTaskStatus(created.task.id, 'succeeded')
    expect(succeeded.id).toBe(created.task.id)
    expect(succeeded.artifact).not.toBeNull()
  })

  it('invalidates a blocked render when the mock workspace switches scenario', async () => {
    let releaseRender!: () => void
    const renderBlocked = new Promise<void>((resolve) => { releaseRender = resolve })
    __setComposeRendererForTests(async (): Promise<ComposeResult> => {
      await renderBlocked
      return {
        ok: true,
        outputPath: 'stale/composite.mp4',
        posterPath: null,
        durationSeconds: 1,
        width: 320,
        height: 180,
        byteSize: 12,
        subtitleMode: 'none',
        notes: ['stale render must be discarded'],
      }
    })

    const createdResponse = await createTask(request('http://localhost/api/compose', composeRequest()))
    const created = ComposeTaskResponseSchema.parse(await createdResponse.json())
    await waitForTaskStatus(created.task.id, 'rendering')

    await resetStore('authenticated-empty')
    releaseRender()
    await new Promise((resolve) => setTimeout(resolve, 25))

    const staleResponse = await getTask(new Request(taskUrl(created.task.id)), params(created.task.id))
    expect(staleResponse.status).toBe(404)
    expect((await readState()).assets).toHaveLength(0)
  })

  it('keeps a scoped compose task private to its owning canvas', async () => {
    __setComposeRendererForTests(async (): Promise<ComposeResult> => ({
      ok: false,
      code: 'render_failed',
      reason: 'scope fixture failure',
    }))

    const createdResponse = await createTask(request('http://localhost/api/compose', {
      ...composeRequest(),
      scope: { projectId: 'project-a', canvasId: 'canvas-a' },
    }))
    const created = ComposeTaskResponseSchema.parse(await createdResponse.json())
    await waitForTaskStatus(created.task.id, 'failed', { projectId: 'project-a', canvasId: 'canvas-a' })

    const wrongRead = await getTask(
      new Request(scopedTaskUrl(created.task.id, 'project-b', 'canvas-b')),
      params(created.task.id),
    )
    expect(wrongRead.status).toBe(404)
    const ownerRead = await getTask(
      new Request(scopedTaskUrl(created.task.id, 'project-a', 'canvas-a')),
      params(created.task.id),
    )
    expect(ownerRead.status).toBe(200)

    const wrongRetry = await transitionTask(
      request(scopedTaskUrl(created.task.id, 'project-b', 'canvas-b'), { action: 'retry' }),
      params(created.task.id),
    )
    expect(wrongRetry.status).toBe(404)
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
