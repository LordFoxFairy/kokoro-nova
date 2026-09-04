import { TransitionScriptV2RunRequestSchema } from '@/contracts/script-v2'
import { handle, parseJsonBody } from '@/server/http'
import { getScriptV2Run, transitionScriptV2Run } from '@/server/script-v2'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ runId: string }> }

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { runId } = await params
    return { run: getScriptV2Run(runId) }
  })
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { runId } = await params
    const body = await parseJsonBody(request, TransitionScriptV2RunRequestSchema, {
      validationStatus: 422,
    })
    return { run: transitionScriptV2Run(runId, body.action) }
  })
}
