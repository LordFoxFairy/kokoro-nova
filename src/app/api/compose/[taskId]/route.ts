import {
  ComposeTaskActionSchema,
  ComposeTaskResponseSchema,
  type ComposeTaskResponse,
} from '@/contracts/compose'
import { cancelComposeTask, getComposeTask, retryComposeTask } from '@/server/compose'
import { HttpError, handle, parseJsonBody } from '@/server/http'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ taskId: string }> }

/** Poll a persisted local compose task; browser refreshes use this same state. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async (): Promise<ComposeTaskResponse> => {
    const { taskId } = await params
    const task = await getComposeTask(taskId)
    if (!task) throw new HttpError(404, '视频合成任务不存在')
    return ComposeTaskResponseSchema.parse({ task })
  })
}

/** Cancel active work or retry a terminal failure without replacing its task id. */
export async function POST(request: Request, { params }: Params) {
  return handle(async (): Promise<ComposeTaskResponse> => {
    const { taskId } = await params
    const body = await parseJsonBody(request, ComposeTaskActionSchema)
    const task = body.action === 'cancel'
      ? await cancelComposeTask(taskId)
      : await retryComposeTask(taskId)
    if (!task) throw new HttpError(404, '视频合成任务不存在')
    return ComposeTaskResponseSchema.parse({ task })
  })
}
