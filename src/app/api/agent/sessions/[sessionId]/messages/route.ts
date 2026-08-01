import { applyMutations } from '@/domain/mutations'
import type { AgentContextChip, CanvasMutation } from '@/domain/types'
import { appendMessage, deriveTitle, planTurn } from '@/server/agent'
import { HttpError, handle } from '@/server/http'
import { findCanvas, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ sessionId: string }> }

/** Send a user turn and get the agent's response appended to the session. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    const body = (await request.json()) as { text: string; context?: AgentContextChip[] }
    const text = (body.text ?? '').trim()
    if (!text) throw new HttpError(400, '消息不能为空')

    return withState((state) => {
      const session = state.sessions.find((s) => s.id === sessionId)
      if (!session) throw new HttpError(404, '会话不存在')

      const context = body.context ?? []
      const userMessage = appendMessage(state, session, { role: 'user', content: text, context })

      // The title is derived from the first user turn.
      if (session.title === '新会话') session.title = deriveTitle(text)

      const turn = planTurn({ state, session, text, context })
      // A quota gate is not a consumed turn — the request was refused.
      if (turn.payload?.kind !== 'quota_gate') {
        session.settings.freeTurns = Math.max(0, session.settings.freeTurns - 1)
      }

      const assistantMessage = appendMessage(state, session, {
        role: 'assistant',
        content: turn.reply,
        payload: turn.payload,
      })

      return { session, messages: [userMessage, assistantMessage] }
    })
  })
}

/**
 * Resolve a pending payload: answer an `ask_human`, or apply/reject a mutation
 * proposal. Applying is the only way agent output reaches the document, and it
 * still goes through `applyMutations` validation.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    const body = (await request.json()) as {
      messageId: string
      action: 'answer' | 'apply' | 'reject' | 'ignore'
      answer?: string
    }

    return withState((state) => {
      const session = state.sessions.find((s) => s.id === sessionId)
      if (!session) throw new HttpError(404, '会话不存在')
      const message = state.messages.find((m) => m.id === body.messageId && m.sessionId === sessionId)
      if (!message?.payload) throw new HttpError(404, '消息不存在或没有可处理的内容')

      if (message.payload.kind === 'ask_human') {
        if (body.action === 'ignore') {
          message.payload = { ...message.payload, answered: true, answer: '' }
          return { session, messages: [message] }
        }
        const answer = (body.answer ?? '').trim()
        if (!answer) throw new HttpError(400, '回答不能为空')
        message.payload = { ...message.payload, answered: true, answer }

        const userMessage = appendMessage(state, session, { role: 'user', content: answer })
        const turn = planTurn({ state, session, text: answer, context: [] })
        if (turn.payload?.kind !== 'quota_gate') {
          session.settings.freeTurns = Math.max(0, session.settings.freeTurns - 1)
        }
        const reply = appendMessage(state, session, {
          role: 'assistant',
          content: turn.reply,
          payload: turn.payload,
        })
        return { session, messages: [message, userMessage, reply] }
      }

      if (message.payload.kind === 'mutation_proposal') {
        if (message.payload.status !== 'pending') {
          return { session, messages: [message] }
        }
        if (body.action === 'reject') {
          message.payload = { ...message.payload, status: 'rejected' }
          const note = appendMessage(state, session, {
            role: 'assistant',
            content: '已取消这次画布改动，没有创建任何节点。',
          })
          return { session, messages: [message, note] }
        }

        const canvasId = session.canvasId
        const canvas = canvasId ? findCanvas(state, canvasId) : undefined
        if (!canvas) throw new HttpError(400, '会话没有绑定画布')

        const mutations = message.payload.mutations as CanvasMutation[]
        canvas.document = applyMutations(canvas.document, mutations)
        canvas.revision += 1
        canvas.updatedAt = new Date().toISOString()

        message.payload = { ...message.payload, status: 'applied' }
        const added = mutations.filter((m) => m.op === 'addNode').length
        const note = appendMessage(state, session, {
          role: 'tool',
          content: `已写入画布：新增 ${added} 个节点。`,
          payload: { kind: 'tool_call', tool: 'canvas.apply', summary: message.payload.summary, status: 'ok' },
        })

        return {
          session,
          messages: [message, note],
          revision: canvas.revision,
          document: canvas.document,
        }
      }

      return { session, messages: [message] }
    })
  })
}
