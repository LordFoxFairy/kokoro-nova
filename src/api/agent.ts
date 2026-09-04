import {
  AgentMessagesResponseSchema,
  AgentSessionDetailResponseSchema,
  CreateAgentSessionResponseSchema,
  DeleteAgentSessionResponseSchema,
  ListAgentSessionsResponseSchema,
  UpdateAgentSessionResponseSchema,
  type ResolveAgentMessageRequest,
  type SendAgentMessageRequest,
} from '@/contracts/agent'
import { api } from '@/lib/api'

const base = '/api/agent/sessions'

/** Typed browser boundary for the deterministic local Agent session aggregate. */
export const agentApi = {
  async list(projectId?: string | null) {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
    return ListAgentSessionsResponseSchema.parse(await api.get<unknown>(`${base}${query}`))
  },
  async create(input: { projectId?: string | null; canvasId?: string | null }) {
    return CreateAgentSessionResponseSchema.parse(await api.post<unknown>(base, input))
  },
  async get(sessionId: string, afterSeq?: number) {
    const query = afterSeq === undefined ? '' : `?afterSeq=${afterSeq}`
    return AgentSessionDetailResponseSchema.parse(await api.get<unknown>(`${base}/${encodeURIComponent(sessionId)}${query}`))
  },
  async update(sessionId: string, patch: { title?: string; shared?: boolean; generationMode?: 'manual' | 'auto'; modelId?: string }) {
    return UpdateAgentSessionResponseSchema.parse(await api.patch<unknown>(`${base}/${encodeURIComponent(sessionId)}`, patch))
  },
  async remove(sessionId: string) {
    return DeleteAgentSessionResponseSchema.parse(await api.del<unknown>(`${base}/${encodeURIComponent(sessionId)}`))
  },
  async send(sessionId: string, input: SendAgentMessageRequest) {
    return AgentMessagesResponseSchema.parse(await api.post<unknown>(`${base}/${encodeURIComponent(sessionId)}/messages`, input))
  },
  async resolve(sessionId: string, input: ResolveAgentMessageRequest) {
    return AgentMessagesResponseSchema.parse(await api.patch<unknown>(`${base}/${encodeURIComponent(sessionId)}/messages`, input))
  },
}
