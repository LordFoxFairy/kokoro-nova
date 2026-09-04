import {
  AgentMessagesResponseSchema,
  ResolveAgentMessageRequestSchema,
  SendAgentMessageRequestSchema,
} from '@/contracts/agent'
import { applyMutations } from '@/domain/mutations'
import type { AgentMessage, AgentSession, CanvasMutation } from '@/domain/types'
import { appendMessage, autoApplyToolTrace, canAutoApplyProposal, deriveTitle, executionTraceForProposal, planTurn } from '@/server/agent'
import { HttpError, handle, parseJsonBody } from '@/server/http'
import { findCanvas, withState } from '@/server/store'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ sessionId: string }> }

function applyProposal(input: {
  state: Parameters<typeof appendMessage>[0]
  session: AgentSession
  message: AgentMessage
  text: string
  context: NonNullable<AgentMessage['context']>
  automatic: boolean
}) {
  const { state, session, message, text, context, automatic } = input
  if (message.payload?.kind !== 'mutation_proposal') throw new HttpError(400, '消息不是工作流改动方案')

  const canvas = session.canvasId ? findCanvas(state, session.canvasId) : undefined
  if (!canvas) throw new HttpError(400, '会话没有绑定画布')
  const mutations = message.payload.mutations as CanvasMutation[]
  canvas.document = applyMutations(canvas.document, mutations)
  canvas.revision += 1
  canvas.updatedAt = new Date().toISOString()
  message.payload = { ...message.payload, status: 'applied' }

  const trace = executionTraceForProposal({ text, context, mutations })
  const autoTrace = automatic ? [autoApplyToolTrace(mutations)] : []
  const toolMessages = [...autoTrace, ...trace.traces].map((item) =>
    appendMessage(state, session, {
      role: 'tool',
      content: item.summary,
      payload: { kind: 'tool_call', ...item },
    }),
  )
  const note = appendMessage(state, session, {
    role: 'assistant',
    content: automatic
      ? `自动模式已应用符合本地安全规则的工作流改动。${trace.note}`
      : trace.note,
  })
  return AgentMessagesResponseSchema.parse({
    session,
    messages: [message, ...toolMessages, note],
    revision: canvas.revision,
    document: canvas.document,
  })
}

/** Send a user turn and persist deterministic Skill/tool plan traces before the confirm gate. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    const body = await parseJsonBody(request, SendAgentMessageRequestSchema)

    return withState((state) => {
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) throw new HttpError(404, '会话不存在')

      const userMessage = appendMessage(state, session, {
        role: 'user',
        content: body.text,
        context: body.context ?? [],
      })
      if (session.title === '新会话') session.title = deriveTitle(body.text)

      const turn = planTurn({ state, session, text: body.text, context: body.context ?? [] })
      if (turn.payload?.kind !== 'quota_gate') {
        session.settings.freeTurns = Math.max(0, session.settings.freeTurns - 1)
      }
      const toolMessages = (turn.toolCalls ?? []).map((trace) =>
        appendMessage(state, session, {
          role: 'tool',
          content: trace.summary,
          payload: { kind: 'tool_call', ...trace },
        }),
      )
      const assistantMessage = appendMessage(state, session, {
        role: 'assistant',
        content: turn.reply,
        payload: turn.payload,
      })

      if (
        session.settings.generationMode === 'auto'
        && assistantMessage.payload?.kind === 'mutation_proposal'
        && assistantMessage.payload.status === 'pending'
        && canAutoApplyProposal(assistantMessage.payload.mutations as CanvasMutation[])
      ) {
        const applied = applyProposal({
          state,
          session,
          message: assistantMessage,
          text: body.text,
          context: body.context ?? [],
          automatic: true,
        })
        return AgentMessagesResponseSchema.parse({
          ...applied,
          messages: [userMessage, ...toolMessages, ...applied.messages],
        })
      }

      return AgentMessagesResponseSchema.parse({ session, messages: [userMessage, ...toolMessages, assistantMessage] })
    })
  })
}

/** Resolve a clarification or explicit plan confirm gate. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { sessionId } = await params
    const body = await parseJsonBody(request, ResolveAgentMessageRequestSchema)

    return withState((state) => {
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) throw new HttpError(404, '会话不存在')
      const message = state.messages.find((item) => item.id === body.messageId && item.sessionId === sessionId)
      if (!message?.payload) throw new HttpError(404, '消息不存在或没有可处理的内容')

      if (message.payload.kind === 'ask_human') {
        if (body.action === 'ignore') {
          message.payload = { ...message.payload, answered: true, answer: '' }
          return AgentMessagesResponseSchema.parse({ session, messages: [message] })
        }
        const answer = (body.answer ?? '').trim()
        if (!answer) throw new HttpError(400, '回答不能为空')
        message.payload = { ...message.payload, answered: true, answer }

        const userMessage = appendMessage(state, session, { role: 'user', content: answer })
        const turn = planTurn({ state, session, text: answer, context: [] })
        if (turn.payload?.kind !== 'quota_gate') {
          session.settings.freeTurns = Math.max(0, session.settings.freeTurns - 1)
        }
        const toolMessages = (turn.toolCalls ?? []).map((trace) =>
          appendMessage(state, session, { role: 'tool', content: trace.summary, payload: { kind: 'tool_call', ...trace } }),
        )
        const reply = appendMessage(state, session, { role: 'assistant', content: turn.reply, payload: turn.payload })
        return AgentMessagesResponseSchema.parse({ session, messages: [message, userMessage, ...toolMessages, reply] })
      }

      if (message.payload.kind === 'mutation_proposal') {
        if (message.payload.status !== 'pending') {
          return AgentMessagesResponseSchema.parse({ session, messages: [message] })
        }
        if (body.action === 'reject') {
          message.payload = { ...message.payload, status: 'rejected' }
          const note = appendMessage(state, session, {
            role: 'assistant',
            content: '已取消这次工作流改动，没有创建任何节点或运行任何本地执行器。',
          })
          return AgentMessagesResponseSchema.parse({ session, messages: [message, note] })
        }

        const source = state.messages
          .filter((item) => item.sessionId === sessionId && item.role === 'user' && item.seq < message.seq)
          .at(-1)
        return applyProposal({
          state,
          session,
          message,
          text: source?.content ?? '',
          context: source?.context ?? [],
          automatic: false,
        })
      }

      return AgentMessagesResponseSchema.parse({ session, messages: [message] })
    })
  })
}
