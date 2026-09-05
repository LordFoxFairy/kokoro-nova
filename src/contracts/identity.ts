import { z } from 'zod'

import { CreationContextSchema } from './creation-context'

/** Local-only return target. It prevents an account action from escaping the app. */
export const LocalReturnToSchema = z.string().min(1).max(2_000).refine(
  (value) => value.startsWith('/') && !value.startsWith('//') && !/^[a-z][a-z\d+.-]*:/i.test(value),
  'returnTo 必须是站内相对路径',
)

/**
 * A durable, local-only description of the action that caused a login gate.
 * `returnTo` carries the route; this union carries the UI state that a route
 * needs to become useful again after the authenticated shell has reloaded.
 */
export const LocalLoginContinuationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('none'),
  }).strict(),
  z.object({
    kind: z.literal('home-creative'),
    source: z.enum(['blank-canvas', 'creator-tool', 'composer']),
    prompt: z.string().max(20_000),
    context: CreationContextSchema,
  }).strict(),
  z.object({
    kind: z.literal('project-route'),
    route: LocalReturnToSchema.refine(
      (value) => value === '/project' || value.startsWith('/project?'),
      '项目登录上下文必须指向 /project',
    ),
  }).strict(),
])

export const LocalIdentitySchema = z.object({
  id: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  avatarInitial: z.string().min(1).max(2),
  maskedAccount: z.string().min(1).max(120),
  uuidMasked: z.string().min(1).max(120),
  accessKey: z.object({
    label: z.literal('Access key'),
    maskedValue: z.string().min(1).max(120),
    state: z.enum(['not-created', 'masked']),
  }).strict(),
  team: z.object({
    label: z.string().min(1).max(120),
    seatCount: z.number().int().nonnegative(),
  }).strict(),
  membership: z.object({
    label: z.string().min(1).max(80),
    benefit: z.string().min(1).max(200),
  }).strict(),
  credits: z.object({
    balance: z.number().int().nonnegative(),
    distributions: z.array(z.object({
      label: z.string().min(1).max(80),
      value: z.number().int().nonnegative(),
    }).strict()).length(4),
  }).strict(),
  storage: z.object({
    usedGb: z.number().nonnegative(),
    totalGb: z.number().positive(),
  }).strict(),
}).strict()

export const LocalSessionSchema = z.object({
  status: z.enum(['authenticated', 'anonymous']),
  returnTo: LocalReturnToSchema,
  continuation: LocalLoginContinuationSchema,
}).strict()

export const IdentityResponseSchema = z.object({
  identity: LocalIdentitySchema.nullable(),
  session: LocalSessionSchema,
}).strict()

export const UpdateSessionRequestSchema = z.object({
  action: z.enum(['signIn', 'signOut']),
  returnTo: LocalReturnToSchema.optional(),
  continuation: LocalLoginContinuationSchema.optional(),
}).strict()

export type LocalIdentity = z.infer<typeof LocalIdentitySchema>
export type LocalSession = z.infer<typeof LocalSessionSchema>
export type LocalLoginContinuation = z.infer<typeof LocalLoginContinuationSchema>
export type IdentityResponse = z.infer<typeof IdentityResponseSchema>
export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequestSchema>
