import { CreateJobRequestSchema } from '@/contracts/jobs'
import { handle, parseJsonBody } from '@/server/http'
import { readState } from '@/server/store'
import { createJob } from '@/server/generation/runner'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const canvasId = url.searchParams.get('canvasId')
    const state = await readState()
    const jobs = state.jobs
      .filter((j) => (canvasId ? j.canvasId === canvasId : true))
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { jobs }
  })
}

/** Compile + quote a node run. Creates the job in `awaiting_confirmation`. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonBody(request, CreateJobRequestSchema)
    const job = await createJob(body)
    return { job }
  })
}
