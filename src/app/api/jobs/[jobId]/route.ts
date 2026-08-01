import { HttpError, handle } from '@/server/http'
import { readState } from '@/server/store'
import { cancelJob, confirmJob, pollJob } from '@/server/generation/runner'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ jobId: string }> }

/** Polling endpoint. Each call reconciles the job against the provider. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { jobId } = await params
    const state = await readState()
    const existing = state.jobs.find((j) => j.id === jobId)
    if (!existing) throw new HttpError(404, '任务不存在')
    const job = await pollJob(jobId)
    const after = await readState()
    const canvas = after.canvases.find((c) => c.id === job.canvasId)
    return {
      job,
      // Terminal success rewrites the node, so hand back the fresh document to
      // save the client a second round trip.
      revision: canvas?.revision ?? null,
      document: job.status === 'succeeded' ? canvas?.document ?? null : null,
      balance: after.balances[job.spaceId] ?? 0,
    }
  })
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { jobId } = await params
    const body = (await request.json().catch(() => ({}))) as { action?: 'confirm' | 'cancel' }
    const job = body.action === 'cancel' ? await cancelJob(jobId) : await confirmJob(jobId)
    const state = await readState()
    return { job, balance: state.balances[job.spaceId] ?? 0 }
  })
}
