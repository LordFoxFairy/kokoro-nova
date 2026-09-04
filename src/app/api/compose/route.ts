import {
  ComposeRequestSchema,
  ComposeTaskResponseSchema,
  type ComposeTaskResponse,
} from '@/contracts/compose'
import { startComposeTask } from '@/server/compose'
import { handle, parseJsonBody } from '@/server/http'

export const dynamic = 'force-dynamic'

/**
 * Creates a durable local compositor task. Rendering is intentionally detached
 * from this response so a refresh can recover queued, rendering and terminal
 * state through /api/compose/:taskId.
 */
export async function POST(request: Request) {
  return handle(async (): Promise<ComposeTaskResponse> => {
    const body = await parseJsonBody(request, ComposeRequestSchema)
    const spec = ComposeRequestSchema.parse(body)
    return ComposeTaskResponseSchema.parse({ task: await startComposeTask(spec) })
  })
}
