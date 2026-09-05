import {
  ComposeTaskActionSchema,
  ComposeTaskResponseSchema,
  ComposeScopeSchema,
  type ComposeTaskResponse,
} from '@/contracts/compose'
import { cancelComposeTask, getComposeTask, retryComposeTask } from '@/server/compose'
import { HttpError, handle, parseJsonBody } from '@/server/http'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ taskId: string }> }

function scopeFromRequest(request: Request) {
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const canvasId = url.searchParams.get('canvasId')
  if (projectId === null && canvasId === null) return undefined
  const parsed = ComposeScopeSchema.safeParse({ projectId, canvasId })
  if (!parsed.success) throw new HttpError(400, '合成任务缺少有效的 projectId/canvasId')
  return parsed.data
}

/** Poll a persisted local compose task; browser refreshes use this same state. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async (): Promise<ComposeTaskResponse> => {
    const { taskId } = await params
    const task = await getComposeTask(taskId, scopeFromRequest(_request))
    if (!task) throw new HttpError(404, '视频合成任务不存在')
    return ComposeTaskResponseSchema.parse({ task })
  })
}

/** Cancel active work or retry a terminal failure without replacing its task id. */
export async function POST(request: Request, { params }: Params) {
  return handle(async (): Promise<ComposeTaskResponse> => {
    const { taskId } = await params
    const body = await parseJsonBody(request, ComposeTaskActionSchema)
    const scope = scopeFromRequest(request)
    const task = body.action === 'cancel'
      ? await cancelComposeTask(taskId, scope)
      : await retryComposeTask(taskId, scope)
    if (!task) throw new HttpError(404, '视频合成任务不存在')
    return ComposeTaskResponseSchema.parse({ task })
  })
}
