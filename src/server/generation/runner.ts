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

export const MEDIA_PUBLIC_PREFIX = '/api/media'

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
    return withState((state) => {
      const live = jobById(state, job.id)
      if (live && live.status === 'queued') live.status = 'running'
      return live ?? job
    })
  } catch (error) {
    // Submission never happened, so the reservation is released in full.
    return withState((state) => {
      const live = jobById(state, job.id)
      if (!live) throw error
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

  const handle = handles.get(jobId)
  if (!handle) {
    // Process restarted while the job was in flight. The provider is the source
    // of truth for whether the side effect happened, so re-attach rather than
    // resubmit — resubmitting could double-charge a real provider.
    try {
      const provider = providerFor(snapshot.modelId)
      const reattached = await provider.submit({
        invocationId: snapshot.invocationId,
        spec: snapshot.spec,
        workspaceDir: path.join(MEDIA_DIR, snapshot.id),
        publicPrefix: `${MEDIA_PUBLIC_PREFIX}/${snapshot.id}`,
      })
      handles.set(jobId, reattached)
    } catch (error) {
      return withState((state) => {
        const job = jobById(state, jobId)
        if (!job) throw error
        job.status = 'failed'
        job.error = '任务句柄丢失且无法恢复'
        job.finishedAt = new Date().toISOString()
        release(state, job.spaceId, job.id, job.quote.credits, '任务不可恢复，积分已返还')
        return job
      })
    }
  }

  const provider = providerFor(snapshot.modelId)
  const status = await provider.poll(handles.get(jobId) as ProviderHandle)

  return withState((state) => {
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
        const actual = Math.round(perUnit * Math.max(1, artifacts.length))
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
}

export async function cancelJob(jobId: string): Promise<GenerationJob> {
  const snapshot = await withState((state) => jobById(state, jobId))
  if (!snapshot) throw new Error('任务不存在')

  if (snapshot.status === 'awaiting_confirmation') {
    // Never reserved, so there is nothing to release.
    return withState((state) => {
      const job = jobById(state, jobId)
      if (!job) throw new Error('任务不存在')
      job.status = 'cancelled'
      job.finishedAt = new Date().toISOString()
      const canvas = findCanvas(state, job.canvasId)
      clearNodeJob(canvas?.document, job.nodeId)
      return job
    })
  }

  const handle = handles.get(jobId)
  if (handle) {
    const provider = providerFor(snapshot.modelId)
    await provider.cancel(handle).catch(() => undefined)
  }
  return pollJob(jobId)
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
