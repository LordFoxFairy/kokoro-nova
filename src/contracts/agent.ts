import { z } from 'zod'

import { CanvasMutationSchema, WorkflowDocumentSchema } from './local'

/**
 * Stable contract for the local deterministic Agent seam.
 *
 * `engine` deliberately identifies a fixture implementation rather than a
 * model/provider. A future gateway can preserve the exact session and tool
 * trace shape while replacing only the planner/executor behind it.
 */
export const AGENT_EXECUTION_ENGINE = 'local-deterministic-skill-runner/v1' as const
export const AgentExecutionEngineSchema = z.literal(AGENT_EXECUTION_ENGINE)

const IdSchema = z.string().trim().min(1).max(200)
const IsoDateTimeSchema = z.string().datetime()

export const AgentGenerationModeSchema = z.enum(['manual', 'auto'])
export const AgentContextChipSchema = z.object({
  id: IdSchema,
  kind: z.enum(['node', 'asset', 'model', 'skill', 'artifact']),
  refId: IdSchema,
  label: z.string().trim().min(1).max(500),
  thumbnailUrl: z.string().min(1).max(2_000).nullable().optional(),
}).strict()

export const AgentSettingsSchema = z.object({
  generationMode: AgentGenerationModeSchema,
  modelId: IdSchema,
  freeTurns: z.number().int().min(0),
}).strict()

export const AgentSessionSchema = z.object({
  id: IdSchema,
  spaceId: IdSchema,
  projectId: IdSchema.nullable(),
  canvasId: IdSchema.nullable(),
  title: z.string().trim().min(1).max(500),
  seq: z.number().int().min(0),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  shared: z.boolean(),
  settings: AgentSettingsSchema,
}).strict()

export const AgentToolStatusSchema = z.enum(['running', 'ok', 'error'])
export const AgentToolCallPayloadSchema = z.object({
  kind: z.literal('tool_call'),
  tool: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2_000),
  status: AgentToolStatusSchema,
}).strict()

export const AgentAskHumanPayloadSchema = z.object({
  kind: z.literal('ask_human'),
  question: z.string().trim().min(1).max(4_000),
  placeholder: z.string().trim().min(1).max(1_000),
  answered: z.boolean(),
  answer: z.string().max(20_000).optional(),
}).strict()

export const AgentMutationProposalPayloadSchema = z.object({
  kind: z.literal('mutation_proposal'),
  summary: z.string().trim().min(1).max(4_000),
  status: z.enum(['pending', 'applied', 'rejected']),
  mutations: z.array(CanvasMutationSchema).min(1).max(100),
}).strict()

export const AgentQuotaGatePayloadSchema = z.object({
  kind: z.literal('quota_gate'),
  reason: z.string().trim().min(1).max(2_000),
}).strict()

export const AgentPayloadSchema = z.discriminatedUnion('kind', [
  AgentAskHumanPayloadSchema,
  AgentToolCallPayloadSchema,
  AgentMutationProposalPayloadSchema,
  AgentQuotaGatePayloadSchema,
])

export const AgentMessageSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  seq: z.number().int().min(1),
  role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.string().max(20_000),
  createdAt: IsoDateTimeSchema,
  context: z.array(AgentContextChipSchema).max(32).optional(),
  payload: AgentPayloadSchema.optional(),
}).strict()

export const CreateAgentSessionRequestSchema = z.object({
  projectId: IdSchema.nullable().optional(),
  canvasId: IdSchema.nullable().optional(),
}).strict()
export const ListAgentSessionsResponseSchema = z.object({ sessions: z.array(AgentSessionSchema) }).strict()
export const AgentSessionDetailResponseSchema = z.object({
  session: AgentSessionSchema,
  messages: z.array(AgentMessageSchema),
}).strict()
export const CreateAgentSessionResponseSchema = AgentSessionSchema
export const UpdateAgentSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  shared: z.boolean().optional(),
  generationMode: AgentGenerationModeSchema.optional(),
  modelId: IdSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, '至少提供一个会话更新字段')
export const UpdateAgentSessionResponseSchema = AgentSessionSchema
export const DeleteAgentSessionResponseSchema = z.object({ deleted: IdSchema }).strict()

export const SendAgentMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  context: z.array(AgentContextChipSchema).max(32).optional().default([]),
}).strict()
export const ResolveAgentMessageRequestSchema = z.object({
  messageId: IdSchema,
  action: z.enum(['answer', 'apply', 'reject', 'ignore']),
  answer: z.string().max(20_000).optional(),
}).strict()
export const AgentMessagesResponseSchema = z.object({
  session: AgentSessionSchema,
  messages: z.array(AgentMessageSchema).min(1),
  revision: z.number().int().min(0).optional(),
  document: WorkflowDocumentSchema.optional(),
}).strict()

export type AgentContextChip = z.infer<typeof AgentContextChipSchema>
export type AgentMessage = z.infer<typeof AgentMessageSchema>
export type AgentSession = z.infer<typeof AgentSessionSchema>
export type SendAgentMessageRequest = z.infer<typeof SendAgentMessageRequestSchema>
export type ResolveAgentMessageRequest = z.infer<typeof ResolveAgentMessageRequestSchema>
