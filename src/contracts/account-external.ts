import { z } from 'zod'

const IdentifierSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/, '标识符只能包含字母、数字、_ 或 -')
const IsoTimestampSchema = z.string().datetime()

/** A masked projection only: the local fixture never generates a secret value. */
export const AccessKeyStateSchema = z.enum(['not-created', 'active', 'revoked'])

export const AccessKeyProjectionSchema = z.object({
  id: IdentifierSchema,
  label: z.literal('Access key'),
  maskedValue: z.string().min(1).max(120),
  state: AccessKeyStateSchema,
  generation: z.number().int().nonnegative(),
  createdAt: IsoTimestampSchema.nullable(),
  revokedAt: IsoTimestampSchema.nullable(),
  scopes: z.array(z.enum(['account:read', 'jobs:create', 'assets:read'])).min(1).max(8),
}).strict().superRefine((value, context) => {
  if (value.state === 'not-created' && (value.generation !== 0 || value.createdAt || value.revokedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '未创建 key 不得带生命周期时间或 generation', path: ['generation'] })
  }
  if (value.state === 'active' && (!value.createdAt || value.revokedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'active key 必须有 createdAt 且不得有 revokedAt', path: ['state'] })
  }
  if (value.state === 'revoked' && (!value.createdAt || !value.revokedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'revoked key 必须保留生命周期时间', path: ['state'] })
  }
})

export const AccessKeyResponseSchema = z.object({
  key: AccessKeyProjectionSchema,
  message: z.string().min(1).max(240),
}).strict()

export const AccessKeyCommandRequestSchema = z.object({
  action: z.enum(['create', 'rotate', 'revoke']),
  idempotencyKey: IdentifierSchema,
}).strict()

export const AccountHandoffStateSchema = z.enum(['ready', 'permission-denied'])
export const ExternalServiceStateSchema = z.enum(['handoff-ready', 'empty', 'authentication-required'])

export const ExternalServiceHandoffSchema = z.object({
  state: ExternalServiceStateSchema,
  owner: z.enum(['billing', 'invoice', 'model-market']),
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(300),
  actionLabel: z.string().min(1).max(80),
  action: z.enum(['open-subscription', 'view-invoices', 'browse-model-market']).nullable(),
}).strict()

export const AccountExternalHandoffsResponseSchema = z.object({
  state: AccountHandoffStateSchema,
  message: z.string().min(1).max(240),
  subscription: ExternalServiceHandoffSchema,
  invoices: ExternalServiceHandoffSchema,
  modelMarket: ExternalServiceHandoffSchema,
}).strict()

export type AccessKeyProjection = z.infer<typeof AccessKeyProjectionSchema>
export type AccessKeyResponse = z.infer<typeof AccessKeyResponseSchema>
export type AccessKeyCommandRequest = z.infer<typeof AccessKeyCommandRequestSchema>
export type AccountExternalHandoffsResponse = z.infer<typeof AccountExternalHandoffsResponseSchema>
