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

/** Runtime boundary for the lifecycle projection returned by the asset routes. */
export const AssetLifecycleViewSchema = z.object({
  id: z.string().min(1),
  spaceId: z.string().min(1),
  namespace: z.enum(['personal', 'agent']),
  kind: z.enum(['image', 'video', 'audio', 'text']),
  name: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  byteSize: z.number().int().nonnegative(),
  tags: z.array(z.enum(['其它', '人物', '场景', '物品', '风格', '音效'])),
  folderId: z.string().nullable(),
  state: z.enum(['staging', 'committed', 'revoked']),
  createdAt: z.string().datetime(),
  sourceArtifactId: z.string().nullable(),
  lifecycle: AssetLifecycleSchema,
}).strict()

export const AssetLifecycleListResponseSchema = z.object({
  assets: z.array(AssetLifecycleViewSchema),
}).strict()

/** Explicit action union keeps restore and fixture-only media invalidation observable. */
export const AssetLifecycleActionSchema = z.enum(['restore', 'mark-media-missing'])
export const AssetLifecycleActionRequestSchema = z.object({ action: AssetLifecycleActionSchema }).strict()

export const AssetListVisibilitySchema = z.enum(['active', 'unavailable', 'all'])
export const AssetListFixtureSchema = z.enum(['none', 'media-missing'])

export type AssetLifecycleAction = z.infer<typeof AssetLifecycleActionSchema>
export type AssetListVisibility = z.infer<typeof AssetListVisibilitySchema>
