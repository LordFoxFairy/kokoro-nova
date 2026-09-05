import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { CreateJobResponseSchema, GetJobResponseSchema, TransitionJobResponseSchema } from '@/contracts/jobs'
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import { DEFAULT_SCENARIO_ID } from '@/mocks/scenarios/catalog'
import { __resetGenerationRunnerForTests } from '@/server/generation/runner'
import { resetStore } from '@/server/store'
import { POST as createJob } from '../route'
import { GET, POST } from './route'

const params = (jobId: string) => ({ params: Promise.resolve({ jobId }) })
const jobUrl = (jobId: string) => `http://localhost/api/jobs/${jobId}`

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function makePendingJob() {
  const response = await createJob(post('http://localhost/api/jobs', {
    canvasId: 'can_video_main',
    nodeId: 'node_video_01',
    fixture: 'pending',
  }))
  expect(response.status).toBe(200)
  return CreateJobResponseSchema.parse(await response.json()).job
}

describe.sequential('/api/jobs/[jobId] route smoke', () => {
  beforeEach(async () => {
    __resetGenerationRunnerForTests()
    await resetStore('authenticated-populated')
  })

  afterAll(async () => {
    __resetGenerationRunnerForTests()
    await resetStore(DEFAULT_SCENARIO_ID)
  })

  it('preserves confirm/cancel/retry state transitions and action replay through typed responses', async () => {
    const source = await makePendingJob()

    const confirmedResponse = await POST(post(jobUrl(source.id), { action: 'confirm' }), params(source.id))
    const confirmed = TransitionJobResponseSchema.parse(await confirmedResponse.json())
    expect(confirmedResponse.status).toBe(200)
    expect(confirmed.job).toMatchObject({ id: source.id, status: 'queued', attempt: 1 })

    const confirmReplayResponse = await POST(post(jobUrl(source.id), { action: 'confirm' }), params(source.id))
    const confirmReplay = TransitionJobResponseSchema.parse(await confirmReplayResponse.json())
    expect(confirmReplayResponse.status).toBe(200)
    expect(confirmReplay).toEqual(confirmed)

    const cancelledResponse = await POST(post(jobUrl(source.id), { action: 'cancel' }), params(source.id))
    const cancelled = TransitionJobResponseSchema.parse(await cancelledResponse.json())
    expect(cancelledResponse.status).toBe(200)
    expect(cancelled.job).toMatchObject({ id: source.id, status: 'cancelled', artifacts: [], error: null })

    const cancelReplayResponse = await POST(post(jobUrl(source.id), { action: 'cancel' }), params(source.id))
    const cancelReplay = TransitionJobResponseSchema.parse(await cancelReplayResponse.json())
    expect(cancelReplayResponse.status).toBe(200)
    expect(cancelReplay).toEqual(cancelled)

    const retriedResponse = await POST(post(jobUrl(source.id), { action: 'retry' }), params(source.id))
    const retried = TransitionJobResponseSchema.parse(await retriedResponse.json())
    expect(retriedResponse.status).toBe(200)
    expect(retried.job).toMatchObject({
      id: expect.any(String),
      status: 'awaiting_confirmation',
      attempt: 0,
      progress: 0,
      artifacts: [],
    })
    expect(retried.job.id).not.toBe(source.id)

    const retryReplayResponse = await POST(post(jobUrl(source.id), { action: 'retry' }), params(source.id))
    const retryReplay = TransitionJobResponseSchema.parse(await retryReplayResponse.json())
    expect(retryReplayResponse.status).toBe(200)
    expect(retryReplay).toEqual(retried)

    const persistedResponse = await GET(new Request(jobUrl(source.id)), params(source.id))
    const persisted = GetJobResponseSchema.parse(await persistedResponse.json())
    expect(persistedResponse.status).toBe(200)
    expect(persisted.job).toMatchObject({ id: source.id, status: 'cancelled' })
  })

  it('normalizes missing jobs and malformed/conflicting transitions', async () => {
    const missingResponse = await GET(new Request(jobUrl('job_missing')), params('job_missing'))
    const missing = LocalErrorEnvelopeSchema.parse(await missingResponse.json())
    expect(missingResponse.status).toBe(404)
    expect(missing).toMatchObject({ error: { code: 'NOT_FOUND', message: '任务不存在' } })

    const job = await makePendingJob()
    const malformedResponse = await POST(post(jobUrl(job.id), { action: 'unknown' }), params(job.id))
    const malformed = LocalErrorEnvelopeSchema.parse(await malformedResponse.json())
    expect(malformedResponse.status).toBe(400)
    expect(malformed.error.code).toBe('INVALID_INPUT')

    const conflictResponse = await POST(post(jobUrl(job.id), { action: 'retry' }), params(job.id))
    const conflict = LocalErrorEnvelopeSchema.parse(await conflictResponse.json())
    expect(conflictResponse.status).toBe(400)
    expect(conflict).toMatchObject({ error: { code: 'INVALID_INPUT', message: '当前任务不能重试' } })
  })
})
