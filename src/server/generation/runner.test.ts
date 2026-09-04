import { promises as fs } from 'node:fs'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { fixtureForInvocation } from '@/domain/jobs'
import { MODELS_BY_ID } from '@/domain/models'
import { mockProvider } from './mock-provider'
import {
  __resetGenerationRunnerForTests,
  cancelJob,
  confirmJob,
  createJob,
  pollJob,
  retryJob,
} from './runner'
import { registerProvider, type GenerationProvider, type ProviderSubmitRequest } from './provider'
import { invalidateCache, readState, resetStore, withState } from '../store'


function handle(invocationId: string) {
  return { providerId: 'generation-lifecycle', invocationId, remoteJobId: `local_${invocationId}` }
}

function lifecycleProvider(): GenerationProvider {
  const requests = new Map<string, ProviderSubmitRequest>()
  const polls = new Map<string, number>()

  return {
    id: 'generation-lifecycle',
    supports: () => true,
    async submit(request) {
      requests.set(request.invocationId, request)
      const fixture = fixtureForInvocation(request.invocationId)
      if (fixture === 'network_offline') throw new Error('本地网络连接已断开（generation fixture: network_offline）')
      if (!['failed', 'cancelled', 'compliance_blocked', 'network_offline'].includes(fixture ?? '')) {
        await fs.mkdir(request.workspaceDir, { recursive: true })
        await fs.writeFile(`${request.workspaceDir}/result.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8')
      }
      return handle(request.invocationId)
    },
    async poll(providerHandle) {
      const count = (polls.get(providerHandle.invocationId) ?? 0) + 1
      polls.set(providerHandle.invocationId, count)
      const request = requests.get(providerHandle.invocationId)
      if (!request) return { state: 'failed', error: '缺少本地请求 fixture' }
      const fixture = fixtureForInvocation(providerHandle.invocationId)
      if (fixture === 'failed') return { state: 'failed', error: '本地失败 fixture' }
      if (fixture === 'cancelled') return { state: 'cancelled' }
      if (fixture === 'compliance_blocked') return { state: 'compliance_blocked', error: '本地合规 fixture' }
      // A queued fixture becomes running only when a durable GET observes it.
      if (fixture === 'pending' && count === 1) return { state: 'running', progress: 11 }
      const media = MODELS_BY_ID.get(request.spec.modelId)?.media
      if (!media) return { state: 'failed', error: '缺少本地媒体模型 fixture' }
      return {
        state: 'succeeded',
        artifacts: [{
          kind: media,
          url: `${request.publicPrefix}/result.svg`,
          thumbnailUrl: null,
          width: media === 'image' || media === 'video' ? 1280 : null,
          height: media === 'image' || media === 'video' ? 720 : null,
          durationSeconds: media === 'audio' || media === 'video' ? 1 : null,
          modelId: request.spec.modelId,
          ...(media === 'text' ? { textContent: '本地脚本和文本 fixture。' } : {}),
        }],
      }
    },
    async cancel() {},
  }
}

const MEDIA_CASES = [
  { label: 'Image', nodeId: 'node_image_01', kind: 'image', modelId: 'lib-image-2', nodeType: 'image' },
  { label: 'Audio', nodeId: 'node_audio_lifecycle', kind: 'audio', modelId: 'seed-audio-1', nodeType: 'audio' },
  { label: 'Text', nodeId: 'node_text_01', kind: 'text', modelId: 'gvlm-3.1', nodeType: 'text' },
  { label: 'Script', nodeId: 'node_script_lifecycle', kind: 'text', modelId: 'gvlm-3.1', nodeType: 'script' },
] as const

async function makeJob(fixture: Parameters<typeof createJob>[0]['fixture']) {
  await resetStore('authenticated-populated')
  return createJob({ canvasId: 'can_video_main', nodeId: 'node_video_01', fixture })
}

async function makeMediaJob(
  media: (typeof MEDIA_CASES)[number],
  fixture: Parameters<typeof createJob>[0]['fixture'],
) {
  await resetStore('authenticated-populated')
  await withState((state) => {
    const canvas = state.canvases.find((candidate) => candidate.id === 'can_video_main')!
    if (media.nodeId !== 'node_audio_lifecycle' && media.nodeId !== 'node_script_lifecycle') return
    const text = canvas.document.nodes.find((candidate) => candidate.id === 'node_text_01')!
    canvas.document.nodes.push({
      ...structuredClone(text),
      id: media.nodeId,
      type: media.nodeType,
      name: media.label,
      data: {
        ...structuredClone(text.data),
        modelId: media.modelId,
        output: media.kind === 'audio' ? { durationSeconds: 3, count: 1 } : {},
        artifacts: [],
        jobId: null,
        extra: {},
      },
    })
  })
  return createJob({ canvasId: 'can_video_main', nodeId: media.nodeId, fixture })
}

function entriesFor(jobId: string) {
  return readState().then((state) => state.ledger.filter((entry) => entry.jobId === jobId))
}

describe.sequential('deterministic generation lifecycle and ledger settlement', () => {
  beforeEach(async () => {
    __resetGenerationRunnerForTests()
    invalidateCache()
    registerProvider(lifecycleProvider())
  })

  afterAll(async () => {
    __resetGenerationRunnerForTests()
    registerProvider(mockProvider)
    await resetStore('authenticated-populated')
  })

  it('keeps pending durable, restores after a handle-table reload, and settles exactly once', async () => {
    const job = await makeJob('pending')
    const confirmed = await confirmJob(job.id)
    expect(confirmed.status).toBe('queued')
    expect((await entriesFor(job.id)).map((entry) => entry.type)).toEqual(['reserve'])

    __resetGenerationRunnerForTests()
    const running = await pollJob(job.id)
    expect(running).toMatchObject({ status: 'running', progress: 11, invocationId: job.invocationId })

    const succeeded = await pollJob(job.id)
    expect(succeeded).toMatchObject({ status: 'succeeded', progress: 100 })
    await expect(pollJob(job.id)).resolves.toMatchObject({ status: 'succeeded', progress: 100 })

    const entries = await entriesFor(job.id)
    expect(entries.map((entry) => entry.type)).toEqual(['reserve', 'settle'])
    expect(entries.filter((entry) => entry.logicalChargeId === `reserve:${job.id}`)).toHaveLength(1)
    expect(entries.filter((entry) => entry.logicalChargeId === `settle:${job.id}`)).toHaveLength(1)
  })

  it.each(MEDIA_CASES)('$label survives queued → running → succeeded recovery with a matching artifact and one settlement', async (media) => {
    const job = await makeMediaJob(media, 'pending')
    expect((await confirmJob(job.id)).status).toBe('queued')

    __resetGenerationRunnerForTests()
    expect(await pollJob(job.id)).toMatchObject({ status: 'running', progress: 11 })
    const succeeded = await pollJob(job.id)

    expect(succeeded).toMatchObject({ status: 'succeeded', progress: 100 })
    expect(succeeded.artifacts).toHaveLength(1)
    expect(succeeded.artifacts[0]).toMatchObject({ kind: media.kind, modelId: succeeded.modelId })
    expect((await entriesFor(job.id)).map((entry) => entry.type)).toEqual(['reserve', 'settle'])
  })

  it('releases a reservation when a provider returns an artifact for another media model', async () => {
    let artifactUrl = ''
    registerProvider({
      id: 'generation-lifecycle',
      supports: () => true,
      async submit(request) {
        await fs.mkdir(request.workspaceDir, { recursive: true })
        await fs.writeFile(`${request.workspaceDir}/wrong.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8')
        artifactUrl = `${request.publicPrefix}/wrong.svg`
        return handle(request.invocationId)
      },
      async poll() {
        return {
          state: 'succeeded',
          artifacts: [{
            kind: 'image',
            url: artifactUrl,
            thumbnailUrl: null,
            width: 1280,
            height: 720,
            durationSeconds: null,
            modelId: 'lib-image-2',
          }],
        }
      },
      async cancel() {},
    })
    const job = await makeJob(undefined)
    await confirmJob(job.id)

    await expect(pollJob(job.id)).resolves.toMatchObject({
      status: 'failed',
      error: expect.stringContaining('不匹配'),
    })
    expect((await entriesFor(job.id)).map((entry) => entry.type)).toEqual(['reserve', 'release'])
    registerProvider(lifecycleProvider())
  })

  it.each(MEDIA_CASES)('$label releases a failed/cancelled run once and retries from a fresh quote', async (media) => {
    for (const [fixture, expectedStatus] of [['failed', 'failed'], ['cancelled', 'cancelled']] as const) {
      const job = await makeMediaJob(media, fixture)
      await confirmJob(job.id)
      expect((await pollJob(job.id)).status).toBe(expectedStatus)
      expect((await entriesFor(job.id)).map((entry) => entry.type)).toEqual(['reserve', 'release'])
    }

    const source = await makeMediaJob(media, 'failed')
    await confirmJob(source.id)
    await pollJob(source.id)
    const retry = await retryJob(source.id)
    expect(retry).toMatchObject({ status: 'awaiting_confirmation', attempt: 0, artifacts: [] })
    await confirmJob(retry.id)
    expect((await pollJob(retry.id)).status).toBe('succeeded')
    expect((await entriesFor(source.id)).map((entry) => entry.type)).toEqual(['reserve', 'release'])
    expect((await entriesFor(retry.id)).map((entry) => entry.type)).toEqual(['reserve', 'settle'])
  })

  it.each([
    ['failed', 'failed', '本地失败 fixture'],
    ['cancelled', 'cancelled', null],
    ['compliance_blocked', 'compliance_blocked', '本地合规 fixture'],
  ] as const)('releases one reservation for %s terminal fixture', async (fixture, status, error) => {
    const job = await makeJob(fixture)
    await confirmJob(job.id)
    const terminal = await pollJob(job.id)

    expect(terminal.status).toBe(status)
    expect(terminal.error).toBe(error)
    const entries = await entriesFor(job.id)
    expect(entries.map((entry) => entry.type)).toEqual(['reserve', 'release'])
    expect(entries.filter((entry) => entry.logicalChargeId === `release:${job.id}`)).toHaveLength(1)
    await expect(pollJob(job.id)).resolves.toMatchObject({ status })
    expect(await entriesFor(job.id)).toHaveLength(2)
  })

  it('cancels idempotently without a second release or provider side effect', async () => {
    const job = await makeJob('pending')
    await confirmJob(job.id)
    const [first, second] = await Promise.all([cancelJob(job.id), cancelJob(job.id)])

    expect(first.status).toBe('cancelled')
    expect(second.status).toBe('cancelled')
    const entries = await entriesFor(job.id)
    expect(entries.map((entry) => entry.type)).toEqual(['reserve', 'release'])
    expect(entries.filter((entry) => entry.logicalChargeId === `release:${job.id}`)).toHaveLength(1)
  })

  it('makes retry one new confirmation job and does not revive the old reservation', async () => {
    const source = await makeJob('failed')
    await confirmJob(source.id)
    await pollJob(source.id)

    const [firstRetry, duplicateRetry] = await Promise.all([retryJob(source.id), retryJob(source.id)])
    expect(duplicateRetry.id).toBe(firstRetry.id)
    expect(firstRetry).toMatchObject({
      status: 'awaiting_confirmation',
      attempt: 0,
      progress: 0,
      artifacts: [],
      error: null,
    })

    await confirmJob(firstRetry.id)
    const completed = await pollJob(firstRetry.id)
    expect(completed.status).toBe('succeeded')
    const sourceEntries = await entriesFor(source.id)
    const retryEntries = await entriesFor(firstRetry.id)
    expect(sourceEntries.map((entry) => entry.type)).toEqual(['reserve', 'release'])
    expect(retryEntries.map((entry) => entry.type)).toEqual(['reserve', 'settle'])
  })

  it('injects expiry, unsupported capability, and offline transport without a duplicate charge', async () => {
    const expired = await makeJob('expired_quote')
    await expect(confirmJob(expired.id)).rejects.toThrow('报价已过期')
    expect(await entriesFor(expired.id)).toEqual([])

    const unsupported = await makeJob('capability_unsupported')
    await expect(confirmJob(unsupported.id)).rejects.toThrow('不能执行该生成能力')
    expect(await entriesFor(unsupported.id)).toEqual([])

    const offline = await makeJob('network_offline')
    const result = await confirmJob(offline.id)
    expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('网络连接') })
    const entries = await entriesFor(offline.id)
    expect(entries.map((entry) => entry.type)).toEqual(['reserve', 'release'])
  })
})
