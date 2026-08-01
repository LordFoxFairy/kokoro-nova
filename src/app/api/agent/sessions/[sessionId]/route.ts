import { HttpError, handle } from '@/server/http'
import { deleteSessions, readState, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ sessionId: string }> }

export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    const url = new URL(request.url)
    // Incremental polling cursor — mirrors the public `afterSeq` contract.
    const afterSeq = Number(url.searchParams.get('afterSeq') ?? '0')

    const state = await readState()
    const session = state.sessions.find((s) => s.id === sessionId)
    if (!session) throw new HttpError(404, '会话不存在')
    const messages = state.messages
      .filter((m) => m.sessionId === sessionId && m.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq)
    return { session, messages }
  })
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    const body = (await request.json()) as {
      title?: string
      shared?: boolean
      generationMode?: 'manual' | 'auto'
      modelId?: string
    }
    return withState((state) => {
      const session = state.sessions.find((s) => s.id === sessionId)
      if (!session) throw new HttpError(404, '会话不存在')
      if (typeof body.title === 'string' && body.title.trim()) session.title = body.title.trim()
      if (typeof body.shared === 'boolean') {
        const hasContent = state.messages.some((m) => m.sessionId === sessionId)
        // Sharing an empty conversation is disabled in the UI; enforce it here.
        if (body.shared && !hasContent) throw new HttpError(400, '空会话不能分享')
        session.shared = body.shared
      }
      if (body.generationMode) session.settings.generationMode = body.generationMode
      if (body.modelId) session.settings.modelId = body.modelId
      session.updatedAt = new Date().toISOString()
      return session
    })
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    return withState((state) => {
      deleteSessions(state, [sessionId])
      return { deleted: sessionId }
    })
  })
}
