import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ids } from '@/domain/ids'
import { compileNode } from '@/domain/compile'
import { MODELS_BY_ID } from '@/domain/models'
import type { Artifact, GenerationJob, WorkflowDocument } from '@/domain/types'
import { findCanvas, MEDIA_DIR, withState, type WorkspaceState } from '../store'
import { release, reserve, settle } from '../ledger'
import { providerFor, registerProvider, type ProviderHandle } from './provider'
import { mockProvider } from './mock-provider'

// The offline provider is always registered; a real one registered afterwards
// shadows it for the models it claims.
registerProvider(mockProvider)

/** In-memory handle table. Rebuilt on restart from `job.invocationId`. */
const handles = new Map<string, ProviderHandle>()
const providerCancelClaims = new Set<string>()

export const MEDIA_PUBLIC_PREFIX = '/api/media'

const ARTIFACT_KINDS = new Set<Artifact['kind']>(['image', 'video', 'audio', 'text'])

function jobById(state: WorkspaceState, jobId: string): GenerationJob | undefined {
  return state.jobs.find((j) => j.id === jobId)
}

/**
 * Compile a node and create a job in `awaiting_confirmation`.
 *
 * Nothing is charged and no provider is called until `confirmJob` runs, so a
 * paid generation can never start without an explicit confirmation.
 */
export async function createJob(params: {
  canvasId: string
  nodeId: string
}): Promise<GenerationJob> {
  return withState((state) => {
    const canvas = findCanvas(state, params.canvasId)
    if (!canvas) throw new Error('画布不存在')
    const project = state.projects.find((p) => p.id === canvas.projectId)
    if (!project) throw new Error('项目不存在')

    const { spec, quote } = compileNode(canvas.document, params.nodeId)

    const job: GenerationJob = {
      id: ids.job(),
      spaceId: project.spaceId,
      projectId: project.id,
      canvasId: canvas.id,
      nodeId: params.nodeId,
      modelId: spec.modelId,
      status: 'awaiting_confirmation',
      invocationId: ids.invocation(),
      attempt: 0,
      progress: 0,
      spec,
      quote,
      artifacts: [],
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    }
    state.jobs.push(job)

    const node = canvas.document.nodes.find((n) => n.id === params.nodeId)
    if (node) node.data.jobId = job.id

    return job
  })
}

/**
 * Reserve credits and hand the frozen spec to the provider.
 * Rejects an expired quote so a stale price is never settled.
 */
export async function confirmJob(jobId: string): Promise<GenerationJob> {
  const prepared = await withState((state) => {
    const job = jobById(state, jobId)
    if (!job) throw new Error('任务不存在')
    if (job.status !== 'awaiting_confirmation') return { job, alreadyStarted: true as const }

    if (new Date(job.quote.expiresAt).getTime() < Date.now()) {
      throw new Error('报价已过期，请重新确认')
    }

    // Reservation and status transition commit together.
    reserve(state, job.spaceId, job.id, job.quote.credits, `生成任务 ${job.spec.nodeType}`)
    job.status = 'queued'
    job.attempt += 1
    job.startedAt = new Date().toISOString()
    return { job, alreadyStarted: false as const }
  })

  if (prepared.alreadyStarted) return prepared.job

  const job = prepared.job
  try {
    const provider = providerFor(job.modelId)
    const handle = await provider.submit({
      invocationId: job.invocationId,
      spec: job.spec,
      workspaceDir: path.join(MEDIA_DIR, job.id),
      publicPrefix: `${MEDIA_PUBLIC_PREFIX}/${job.id}`,
    })
    handles.set(job.id, handle)
    const live = await withState((state) => {
      const live = jobById(state, job.id)
      if (live && live.status === 'queued') live.status = 'running'
      return live ?? job
    })
    if (live.status === 'cancelled') await cancelProviderOnce(job.id, provider, handle)
    return live
  } catch (error) {
    // Submission never happened, so the reservation is released in full.
    return withState((state) => {
      const live = jobById(state, job.id)
      if (!live) throw error
      if (isTerminal(live.status)) return live
      live.status = 'failed'
      live.error = error instanceof Error ? error.message : String(error)
      live.finishedAt = new Date().toISOString()
      release(state, live.spaceId, live.id, live.quote.credits, '提交失败，积分已返还')
      return live
    })
  }
}

/**
 * Poll the provider and reconcile the job.
 *
 * Terminal transitions also write the artifacts back onto the node and settle
 * or release the reservation, all inside one store write.
 */
export async function pollJob(jobId: string): Promise<GenerationJob> {
  const snapshot = await withState((state) => jobById(state, jobId))
  if (!snapshot) throw new Error('任务不存在')
  if (isTerminal(snapshot.status) || snapshot.status === 'awaiting_confirmation') return snapshot

  try {
    const handle = handles.get(jobId)
    if (!handle) {
      // Process restarted while the job was in flight. The provider is the source
      // of truth for whether the side effect happened, so re-attach rather than
      // resubmit — resubmitting could double-charge a real provider.
      const provider = providerFor(snapshot.modelId)
      const reattached = await provider.submit({
        invocationId: snapshot.invocationId,
        spec: snapshot.spec,
        workspaceDir: path.join(MEDIA_DIR, snapshot.id),
        publicPrefix: `${MEDIA_PUBLIC_PREFIX}/${snapshot.id}`,
      })
      handles.set(jobId, reattached)
    }

    const provider = providerFor(snapshot.modelId)
    const status = await provider.poll(handles.get(jobId) as ProviderHandle)
    if (status.state === 'succeeded') await validateArtifacts(snapshot, status.artifacts)

    return await withState((state) => {
    const job = jobById(state, jobId)
    if (!job) throw new Error('任务不存在')
    // A terminal status may have been written by a concurrent poll.
    if (isTerminal(job.status)) return job

    const canvas = findCanvas(state, job.canvasId)

    switch (status.state) {
      case 'running': {
        job.status = 'running'
        job.progress = status.progress
        break
      }
      case 'succeeded': {
        const artifacts: Artifact[] = status.artifacts.map((a) => ({
          ...a,
          id: ids.artifact(),
          jobId: job.id,
          assetId: null,
          createdAt: new Date().toISOString(),
        }))
        job.artifacts = artifacts
        job.status = 'succeeded'
        job.progress = 100
        job.finishedAt = new Date().toISOString()

        // Settle against what was actually produced.
        const model = MODELS_BY_ID.get(job.modelId)
        const perUnit = job.quote.credits / (job.spec.output.count ?? 1)
        const actual = Math.min(job.quote.credits, Math.round(perUnit * artifacts.length))
        settle(state, job.spaceId, job.id, job.quote.credits, actual, model?.label ?? job.modelId)

        if (canvas) {
          writeArtifactsToNode(canvas.document, job.nodeId, artifacts)
          canvas.revision += 1
          canvas.updatedAt = new Date().toISOString()
        }
        break
      }
      case 'failed':
      case 'compliance_blocked': {
        job.status = status.state === 'failed' ? 'failed' : 'compliance_blocked'
        job.error = status.error
        job.finishedAt = new Date().toISOString()
        release(state, job.spaceId, job.id, job.quote.credits, '生成未成功，积分已返还')
        clearNodeJob(canvas?.document, job.nodeId)
        break
      }
      case 'cancelled': {
        job.status = 'cancelled'
        job.finishedAt = new Date().toISOString()
        release(state, job.spaceId, job.id, job.quote.credits, '任务已取消，积分已返还')
        clearNodeJob(canvas?.document, job.nodeId)
        break
      }
    }

    return job
    })
  } catch (error) {
    return failJob(jobId, error instanceof Error ? error.message : String(error))
  }
}

export async function cancelJob(jobId: string): Promise<GenerationJob> {
  const transition = await withState((state) => {
    const job = jobById(state, jobId)
    if (!job) throw new Error('任务不存在')
    if (isTerminal(job.status)) return { job, shouldCancelProvider: false }

    const wasAwaitingConfirmation = job.status === 'awaiting_confirmation'
    job.status = 'cancelled'
    job.finishedAt = new Date().toISOString()
    if (!wasAwaitingConfirmation) {
      release(state, job.spaceId, job.id, job.quote.credits, '任务已取消，积分已返还')
    }
    const canvas = findCanvas(state, job.canvasId)
    clearNodeJob(canvas?.document, job.nodeId)
    return { job, shouldCancelProvider: true }
  })

  if (transition.shouldCancelProvider) {
    const handle = handles.get(jobId)
    if (handle) await cancelProviderOnce(jobId, providerFor(transition.job.modelId), handle)
  }
  handles.delete(jobId)
  return transition.job
}

async function cancelProviderOnce(jobId: string, provider: ReturnType<typeof providerFor>, handle: ProviderHandle) {
  if (providerCancelClaims.has(jobId)) return
  providerCancelClaims.add(jobId)
  await provider.cancel(handle).catch(() => undefined)
}

async function failJob(jobId: string, error: string): Promise<GenerationJob> {
  return withState((state) => {
    const job = jobById(state, jobId)
    if (!job) throw new Error('任务不存在')
    if (isTerminal(job.status)) return job
    job.status = 'failed'
    job.error = error
    job.finishedAt = new Date().toISOString()
    release(state, job.spaceId, job.id, job.quote.credits, '生成未成功，积分已返还')
    const canvas = findCanvas(state, job.canvasId)
    clearNodeJob(canvas?.document, job.nodeId)
    handles.delete(jobId)
    return job
  })
}

async function validateArtifacts(job: GenerationJob, artifacts: unknown): Promise<void> {
  const expectedCount = job.spec.output.count ?? 1
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new Error('provider 未返回有效产物')
  if (artifacts.length > expectedCount) throw new Error('provider 返回的产物数量超出请求')

  for (const artifact of artifacts) {
    if (!isRecord(artifact)) throw new Error('provider 返回了非法产物')
    if (!ARTIFACT_KINDS.has(artifact.kind as Artifact['kind'])) throw new Error('provider 返回了非法产物类型')
    if (typeof artifact.modelId !== 'string' || artifact.modelId.length === 0) throw new Error('provider 返回了非法产物模型')
    if (!validDimension(artifact.width) || !validDimension(artifact.height) || !validDuration(artifact.durationSeconds)) {
      throw new Error('provider 返回了非法产物尺寸')
    }
    if (artifact.thumbnailUrl !== null && typeof artifact.thumbnailUrl !== 'string') {
      throw new Error('provider 返回了非法产物缩略图')
    }
    if (artifact.textContent !== undefined && artifact.textContent !== null && typeof artifact.textContent !== 'string') {
      throw new Error('provider 返回了非法文本产物')
    }

    await assertLocalArtifactFile(job.id, artifact.url)
    if (artifact.thumbnailUrl !== null) await assertLocalArtifactFile(job.id, artifact.thumbnailUrl)
  }
}

async function assertLocalArtifactFile(jobId: string, url: unknown): Promise<void> {
  if (typeof url !== 'string' || url.length === 0) throw new Error('provider 返回了缺失产物 URL')
  const prefix = `${MEDIA_PUBLIC_PREFIX}/${jobId}/`
  if (!url.startsWith(prefix)) throw new Error('provider 返回了越界产物 URL')
  const file = path.resolve(MEDIA_DIR, jobId, url.slice(prefix.length))
  const root = path.resolve(MEDIA_DIR, jobId)
  if (file === root || !file.startsWith(`${root}${path.sep}`)) throw new Error('provider 返回了越界产物路径')
  const stat = await fs.stat(file).catch(() => null)
  if (!stat?.isFile() || stat.size === 0) throw new Error('provider 返回了缺失产物文件')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validDimension(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0)
}

function validDuration(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

function isTerminal(status: GenerationJob['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'compliance_blocked'
}

function writeArtifactsToNode(doc: WorkflowDocument, nodeId: string, artifacts: Artifact[]) {
  const node = doc.nodes.find((n) => n.id === nodeId)
  if (!node) return
  // Newest first; earlier artifacts stay reachable from the expanded grid.
  node.data.artifacts = [...artifacts, ...(node.data.artifacts ?? [])]
  node.data.jobId = null
  node.updatedAt = new Date().toISOString()
}

function clearNodeJob(doc: WorkflowDocument | undefined, nodeId: string) {
  const node = doc?.nodes.find((n) => n.id === nodeId)
  if (node) node.data.jobId = null
}
