import {
  AgentSessionDetailResponseSchema,
  DeleteAgentSessionResponseSchema,
  UpdateAgentSessionRequestSchema,
  UpdateAgentSessionResponseSchema,
} from '@/contracts/agent'
import { HttpError, handle, parseJsonBody } from '@/server/http'
import { deleteSessions, readState, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ sessionId: string }> }

export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    const afterSeq = Number(new URL(request.url).searchParams.get('afterSeq') ?? '0')
    if (!Number.isInteger(afterSeq) || afterSeq < 0) throw new HttpError(400, 'afterSeq 必须是非负整数')

    const state = await readState()
    const session = state.sessions.find((item) => item.id === sessionId)
    if (!session) throw new HttpError(404, '会话不存在')
    const messages = state.messages
      .filter((message) => message.sessionId === sessionId && message.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq)
    return AgentSessionDetailResponseSchema.parse({ session, messages })
  })
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    const body = await parseJsonBody(request, UpdateAgentSessionRequestSchema)
    return withState((state) => {
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) throw new HttpError(404, '会话不存在')
      if (body.title) session.title = body.title
      if (typeof body.shared === 'boolean') {
        const hasContent = state.messages.some((message) => message.sessionId === sessionId)
        if (body.shared && !hasContent) throw new HttpError(400, '空会话不能分享')
        session.shared = body.shared
      }
      if (body.generationMode) session.settings.generationMode = body.generationMode
      if (body.modelId) session.settings.modelId = body.modelId
      session.updatedAt = new Date().toISOString()
      return UpdateAgentSessionResponseSchema.parse(session)
    })
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    return withState((state) => {
      deleteSessions(state, [sessionId])
      return DeleteAgentSessionResponseSchema.parse({ deleted: sessionId })
    })
  })
}
