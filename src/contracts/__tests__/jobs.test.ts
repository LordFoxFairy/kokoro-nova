import { describe, expect, it } from 'vitest'

import createRequestExample from '../../../docs/api/examples/jobs-create.request.json'
import createResponseExample from '../../../docs/api/examples/jobs-create.response.json'
import getResponseExample from '../../../docs/api/examples/jobs-get.response.json'
import listResponseExample from '../../../docs/api/examples/jobs-list.response.json'
import transitionRequestExample from '../../../docs/api/examples/jobs-transition.request.json'
import transitionResponseExample from '../../../docs/api/examples/jobs-transition.response.json'
import {
  CreateJobRequestSchema,
  CreateJobResponseSchema,
  GetJobResponseSchema,
  ListJobsResponseSchema,
  TransitionJobRequestSchema,
  TransitionJobResponseSchema,
} from '@/contracts/jobs'
import { buildVideoWorkspace } from '@/mocks/scenarios/video-project'

function fixture() {
  const state = buildVideoWorkspace('running')
  const job = state.jobs.find((item) => item.id === 'job_video_01')
  const canvas = state.canvases.find((item) => item.id === 'can_video_main')
  if (!job || !canvas) throw new Error('fixture incomplete')
  return { state, job, canvas }
}

describe('local Jobs request contracts', () => {
  it('accepts only a strict canvas/node create payload', () => {
    expect(CreateJobRequestSchema.parse({ canvasId: 'can_fixture', nodeId: 'node_fixture' })).toEqual({
      canvasId: 'can_fixture',
      nodeId: 'node_fixture',
    })
    expect(CreateJobRequestSchema.safeParse({ canvasId: '', nodeId: 'node_fixture' }).success).toBe(false)
    expect(
      CreateJobRequestSchema.safeParse({ canvasId: 'can_fixture', nodeId: 'node_fixture', extra: true }).success,
    ).toBe(false)
  })

  it('keeps polling on GET and limits POST transitions to confirm/cancel', () => {
    expect(TransitionJobRequestSchema.parse({ action: 'confirm' })).toEqual({ action: 'confirm' })
    expect(TransitionJobRequestSchema.parse({ action: 'cancel' })).toEqual({ action: 'cancel' })
    expect(TransitionJobRequestSchema.safeParse({ action: 'poll' }).success).toBe(false)
    expect(TransitionJobRequestSchema.safeParse({}).success).toBe(false)
  })
})

describe('local Jobs response contracts', () => {
  it('parses the exact list/create/get/transition wrappers', () => {
    const { state, job, canvas } = fixture()

    expect(ListJobsResponseSchema.parse({ jobs: state.jobs })).toEqual({ jobs: state.jobs })
    expect(CreateJobResponseSchema.parse({ job })).toEqual({ job })
    expect(
      GetJobResponseSchema.parse({
        job,
        revision: canvas.revision,
        document: null,
        balance: state.balances[job.spaceId],
      }),
    ).toMatchObject({ job, revision: canvas.revision, document: null })
    expect(
      TransitionJobResponseSchema.parse({ job, balance: state.balances[job.spaceId] }),
    ).toEqual({ job, balance: state.balances[job.spaceId] })
  })

  it('rejects generic placeholders and malformed nested jobs', () => {
    expect(ListJobsResponseSchema.safeParse({ ok: true }).success).toBe(false)
    expect(CreateJobResponseSchema.safeParse({ job: { ...fixture().job, progress: 101 } }).success).toBe(false)
    expect(
      GetJobResponseSchema.safeParse({ job: fixture().job, revision: '7', document: null, balance: 408 }).success,
    ).toBe(false)
  })

  it('keeps every documented Jobs JSON example executable against the runtime schema', () => {
    expect(CreateJobRequestSchema.parse(createRequestExample)).toEqual(createRequestExample)
    expect(CreateJobResponseSchema.parse(createResponseExample)).toEqual(createResponseExample)
    expect(ListJobsResponseSchema.parse(listResponseExample)).toEqual(listResponseExample)
    expect(GetJobResponseSchema.parse(getResponseExample)).toEqual(getResponseExample)
    expect(TransitionJobRequestSchema.parse(transitionRequestExample)).toEqual(transitionRequestExample)
    expect(TransitionJobResponseSchema.parse(transitionResponseExample)).toEqual(transitionResponseExample)
  })
})
