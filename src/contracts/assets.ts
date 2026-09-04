import { z } from 'zod'

export const AssetAvailabilitySchema = z.enum(['active', 'missing', 'deleted', 'recoverable'])
export const AssetLifecycleReasonSchema = z.enum([
  'available',
  'media_url_unavailable',
  'deleted_by_user',
  'source_artifact_removed',
  'source_node_deleted',
])

export const AssetLifecycleSchema = z.object({
  assetId: z.string().min(1),
  availability: AssetAvailabilitySchema,
  reason: AssetLifecycleReasonSchema,
  changedAt: z.string().datetime(),
  recoverableUntil: z.string().datetime().nullable(),
}).strict()

/** Explicit action union keeps restore and fixture-only media invalidation observable. */
export const AssetLifecycleActionSchema = z.enum(['restore', 'mark-media-missing'])
export const AssetLifecycleActionRequestSchema = z.object({ action: AssetLifecycleActionSchema }).strict()

export const AssetListVisibilitySchema = z.enum(['active', 'unavailable', 'all'])
export const AssetListFixtureSchema = z.enum(['none', 'media-missing'])

export type AssetLifecycleAction = z.infer<typeof AssetLifecycleActionSchema>
export type AssetListVisibility = z.infer<typeof AssetListVisibilitySchema>
