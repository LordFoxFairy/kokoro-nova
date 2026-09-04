import { promises as fs } from 'node:fs'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { GenerationProvider, ProviderStatus } from '@/server/generation/provider'
import { mockProvider } from '@/server/generation/mock-provider'
import { cancelJob, confirmJob, createJob, pollJob } from '@/server/generation/runner'
import { registerProvider } from '@/server/generation/provider'
import { invalidateCache, readState, resetStore, withState } from '@/server/store'

const MODEL_ID = 'seedance-2'

function handle(invocationId: string) {
  return { providerId: 'generation-reliability', invocationId, remoteJobId: `test_${invocationId}` }
}

function providerFor(status: ProviderStatus | (() => Promise<ProviderStatus>)): GenerationProvider {
  return {
    id: 'generation-reliability',
    supports: (modelId) => modelId === MODEL_ID,
    async submit(request) {
      return handle(request.invocationId)
    },
    async poll() {
      return typeof status === 'function' ? status() : status
    },
    async cancel() {},
  }
}

async function newJob() {
  await resetStore('authenticated-populated')
  return createJob({ canvasId: 'can_video_main', nodeId: 'node_video_01' })
}

describe.sequential('generation runner reliability', () => {
  beforeEach(async () => {
    registerProvider(mockProvider)
    invalidateCache()
  })

  afterAll(async () => {
    registerProvider(mockProvider)
    await resetStore('authenticated-populated')
  })

  it('releases the reservation when provider polling throws', async () => {
    registerProvider(providerFor(async () => {
      throw new Error('poll exploded')
    }))
    const job = await newJob()

    await confirmJob(job.id)
    const result = await pollJob(job.id)
    const state = await readState()

    expect(result).toMatchObject({ status: 'failed', error: 'poll exploded', artifacts: [] })
    expect(state.balances[job.spaceId]).toBe(408)
  })

  it('rejects a successful provider response with no artifacts and releases credits', async () => {
    registerProvider(providerFor({ state: 'succeeded', artifacts: [] }))
    const job = await newJob()

    await confirmJob(job.id)
    const result = await pollJob(job.id)
    const state = await readState()

    expect(result).toMatchObject({ status: 'failed', artifacts: [] })
    expect(result.error).toContain('产物')
    expect(state.balances[job.spaceId]).toBe(408)
  })

  it('rejects an artifact outside the local job media directory', async () => {
    registerProvider(providerFor({
      state: 'succeeded',
      artifacts: [{
        kind: 'video',
        url: '/api/media/other-job/result.mp4',
        thumbnailUrl: null,
        width: 1280,
        height: 720,
        durationSeconds: 1,
        modelId: MODEL_ID,
      }],
    }))
    const job = await newJob()

    await confirmJob(job.id)
    const result = await pollJob(job.id)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('产物')
  })

  it('wins a cancel race against confirm without leaving a reserved balance', async () => {
    let submitStarted!: () => void
    let releaseSubmit!: () => void
    const started = new Promise<void>((resolve) => { submitStarted = resolve })
    const blocked = new Promise<void>((resolve) => { releaseSubmit = resolve })
    let cancelCalls = 0
    registerProvider({
      ...providerFor({ state: 'running', progress: 1 }),
      async submit(request) {
        submitStarted()
        await blocked
        return handle(request.invocationId)
      },
      async cancel() {
        cancelCalls += 1
      },
    })
    const job = await newJob()

    const confirming = confirmJob(job.id)
    await started
    const cancelling = cancelJob(job.id)
    releaseSubmit()
    const [confirmed, cancelled] = await Promise.all([confirming, cancelling])
    const state = await readState()

    expect(confirmed.status).toBe('cancelled')
    expect(cancelled.status).toBe('cancelled')
    expect(state.balances[job.spaceId]).toBe(408)
    expect(state.ledger.filter((entry) => entry.logicalChargeId === `release:${job.id}`)).toHaveLength(1)
    expect(cancelCalls).toBe(1)
  })

  it('reattaches a queued job after the in-memory handle is gone', async () => {
    const fileName = 'reattached.mp4'
    let artifactUrl = ''
    registerProvider({
      ...providerFor({
        state: 'succeeded',
        artifacts: [],
      }),
      async submit(request) {
        await fs.mkdir(request.workspaceDir, { recursive: true })
        await fs.writeFile(`${request.workspaceDir}/${fileName}`, 'fixture')
        artifactUrl = `${request.publicPrefix}/${fileName}`
        return handle(request.invocationId)
      },
      async poll() {
        return {
          state: 'succeeded',
          artifacts: [{
            kind: 'video',
            url: artifactUrl,
            thumbnailUrl: null,
            width: 1280,
            height: 720,
            durationSeconds: 1,
            modelId: MODEL_ID,
          }],
        }
      },
    })
    const job = await newJob()
    await withState((state) => {
      const live = state.jobs.find((candidate) => candidate.id === job.id)!
      live.status = 'queued'
      live.attempt = 1
      live.startedAt = new Date().toISOString()
      state.balances[live.spaceId] -= live.quote.credits
      state.ledger.push({
        id: `reserve-${live.id}`,
        spaceId: live.spaceId,
        type: 'reserve',
        credits: -live.quote.credits,
        balanceAfter: state.balances[live.spaceId],
        logicalChargeId: `reserve:${live.id}`,
        jobId: live.id,
        note: 'test reserve',
        createdAt: new Date().toISOString(),
      })
    })
    const result = await pollJob(job.id)

    expect(result.status).toBe('succeeded')
    expect(result.artifacts).toHaveLength(1)
  })
})
