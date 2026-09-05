import { z } from 'zod'

/** Process-local identifiers are still strict at the HTTP boundary. */
export const PresenceParticipantIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, '参与者标识不合法')

export const PresencePointSchema = z
  .object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
  })
  .strict()

export const PresenceViewportSchema = z
  .object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
    zoom: z.number().finite().min(0.01).max(100),
  })
  .strict()

export const PresenceHeartbeatRequestSchema = z
  .object({
    participantId: PresenceParticipantIdSchema,
    name: z.string().trim().min(1).max(24).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), '显示名称包含控制字符'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色必须是 #rrggbb 格式'),
    cursor: PresencePointSchema.nullable(),
    viewport: PresenceViewportSchema,
  })
  .strict()

export const PresenceLeaseActionSchema = z.enum(['acquire', 'heartbeat', 'release'])

/**
 * A lease is separate from cursor heartbeats: collaboration remains available
 * to viewers who are following the current editor. Lease ids are opaque and
 * never enter WorkflowDocument or fixture persistence.
 */
export const PresenceLeaseRequestSchema = z
  .object({
    action: PresenceLeaseActionSchema,
    participantId: PresenceParticipantIdSchema,
    leaseId: z.string().regex(/^lease_[A-Za-z0-9_-]{1,64}$/, '编辑租约标识不合法').optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.action === 'heartbeat' || value.action === 'release') && !value.leaseId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['leaseId'], message: '续约或释放需要 leaseId' })
    }
    if (value.action === 'acquire' && value.leaseId !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['leaseId'], message: '获取租约不能携带 leaseId' })
    }
  })

export const PresenceUpdateRequestSchema = z.union([
  PresenceHeartbeatRequestSchema,
  PresenceLeaseRequestSchema,
])

export const EditorLeaseSchema = z
  .object({
    canvasId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    clientId: PresenceParticipantIdSchema,
    leaseId: z.string().regex(/^lease_[A-Za-z0-9_-]{1,64}$/),
    acquiredAt: z.string().datetime(),
    heartbeatAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    state: z.literal('active'),
  })
  .strict()

export const PresenceParticipantSchema = z
  .object({
    id: PresenceParticipantIdSchema,
    name: z.string().min(1).max(24),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    cursor: PresencePointSchema.nullable(),
    viewport: PresenceViewportSchema,
    lastSeenAt: z.number().int().nonnegative(),
  })
  .strict()

export const PresenceHeartbeatResponseSchema = z
  .object({ ok: z.literal(true), participant: PresenceParticipantSchema })
  .strict()

export const PresenceLeaseResponseSchema = z
  .object({
    ok: z.literal(true),
    action: PresenceLeaseActionSchema,
    lease: EditorLeaseSchema.nullable(),
  })
  .strict()

export type PresencePointContract = z.infer<typeof PresencePointSchema>
export type PresenceViewportContract = z.infer<typeof PresenceViewportSchema>
export type PresenceHeartbeatRequest = z.infer<typeof PresenceHeartbeatRequestSchema>
export type PresenceLeaseRequest = z.infer<typeof PresenceLeaseRequestSchema>
export type EditorLease = z.infer<typeof EditorLeaseSchema>
export type PresenceParticipantContract = z.infer<typeof PresenceParticipantSchema>
