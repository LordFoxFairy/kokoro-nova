import { z } from 'zod'

import { CanvasSchema, ProjectSchema } from './local'

export const ShowcaseCategorySchema = z.enum([
  '全部',
  'AI 漫剧精卫计划',
  '广告导演请就位',
  '精选画布',
  '专业影视',
  '短剧漫剧',
  '商业广告',
  '动漫游戏',
  '教育生活',
  'TV 工具箱',
])

export const ShowcaseQualitySchema = z.enum(['auto', '480p', '720p', 'original'])

export const ShowcaseMediaSchema = z.object({
  url: z.string().nullable(),
  posterUrl: z.string().nullable(),
  durationSeconds: z.number().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  originalQualityLabel: z.string().min(1),
})

/** A public player may only receive an in-origin local fixture media address. */
const LocalShowcaseMediaUrlSchema = z.string().regex(/^\/api\/media\//, '播放器媒体必须是本地 /api/media/ 地址')

export const ShowcasePlaybackVariantSchema = z.object({
  quality: ShowcaseQualitySchema.exclude(['auto']),
  label: z.string().min(1),
  /** Each quality remains a local fixture URL; the quality query is a deterministic delivery key. */
  url: LocalShowcaseMediaUrlSchema,
}).strict()

/**
 * Fetching the manifest is the player’s only source-selection boundary. Native
 * media events then drive buffering, fallback, error and retry locally.
 */
export const ShowcasePlaybackManifestSchema = z.object({
  snapshotId: z.string().trim().min(1),
  media: ShowcaseMediaSchema,
  initialQuality: ShowcaseQualitySchema.exclude(['auto']),
  variants: z.array(ShowcasePlaybackVariantSchema).min(1),
  fallbackOrder: z.array(ShowcaseQualitySchema.exclude(['auto'])).min(1),
}).strict().superRefine((manifest, context) => {
  const qualities = manifest.variants.map((variant) => variant.quality)
  if (new Set(qualities).size !== qualities.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '播放清单不能包含重复清晰度', path: ['variants'] })
  }
  if (!qualities.includes(manifest.initialQuality)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '初始清晰度必须存在于 variants', path: ['initialQuality'] })
  }
  if (new Set(manifest.fallbackOrder).size !== manifest.fallbackOrder.length || manifest.fallbackOrder.some((quality) => !qualities.includes(quality))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'fallbackOrder 必须是 variants 的无重复子集', path: ['fallbackOrder'] })
  }
})

export const ShowcaseEntryProjectionBaseSchema = z.object({
  /** `id` is the public discovery key and is intentionally equal to snapshotId. */
  id: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
  title: z.string(),
  summary: z.string(),
  coverUrl: z.string().nullable(),
  publishedAt: z.string().datetime(),
  nodeCount: z.number().int().nonnegative(),
  mediaCount: z.number().int().nonnegative(),
  category: ShowcaseCategorySchema.exclude(['全部']),
  author: z.string(),
  authorTier: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
  likeCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
  hasAiContent: z.boolean(),
  processAvailable: z.boolean(),
  media: ShowcaseMediaSchema,
})

export const ShowcaseEntryProjectionSchema = ShowcaseEntryProjectionBaseSchema
  .refine((entry) => entry.id === entry.snapshotId, {
    message: '公开发现 id 必须与 snapshotId 一致',
    path: ['snapshotId'],
  })

/** Public directory request. Search is submitted explicitly rather than on each keystroke. */
export const ShowcaseListQuerySchema = z.object({
  category: ShowcaseCategorySchema.default('全部'),
  query: z.string().trim().max(160).default(''),
  offset: z.number().int().nonnegative().max(10_000).default(0),
  limit: z.number().int().min(1).max(24).default(4),
})

export const ShowcasePageSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  nextOffset: z.number().int().nonnegative().nullable(),
  category: ShowcaseCategorySchema,
  query: z.string(),
  /** The official catalogue recommends its category when a submitted query has no exact match. */
  searchFallback: z.boolean(),
})

export const ShowcaseDetailResponseSchema = z.object({
  entry: ShowcaseEntryProjectionSchema,
  related: z.array(ShowcaseEntryProjectionSchema),
})

/** Viewer-local interaction state. Public snapshot fields remain immutable. */
export const ShowcaseEngagementActionSchema = z.enum(['like', 'unlike', 'share'])

export const ShowcaseEngagementRequestSchema = z.object({
  action: ShowcaseEngagementActionSchema,
}).strict()

/**
 * Local engagement is a projection beside the frozen public snapshot. `likeCount`
 * includes at most one contribution from the current deterministic viewer.
 */
export const ShowcaseEngagementResponseSchema = z.object({
  snapshotId: z.string().trim().min(1),
  liked: z.boolean(),
  likeCount: z.number().int().nonnegative(),
  shareCount: z.number().int().nonnegative(),
  shareUrl: z.string().regex(/^\/showcase\//, '分享链接必须是站内公开作品路径'),
  feedback: z.string().min(1),
}).strict()

export const ShowcaseListResponseSchema = z.object({
  entries: z.array(ShowcaseEntryProjectionSchema),
  page: ShowcasePageSchema,
})

/** A clone is a new private project; public snapshot resources remain read-only. */
export const ShowcaseCloneResponseSchema = z.object({
  sourceSnapshotId: z.string().trim().min(1),
  project: ProjectSchema,
  canvas: CanvasSchema,
}).strict()

export type ShowcaseCategory = z.infer<typeof ShowcaseCategorySchema>
export type ShowcaseQuality = z.infer<typeof ShowcaseQualitySchema>
export type ShowcaseMedia = z.infer<typeof ShowcaseMediaSchema>
export type ShowcasePlaybackVariant = z.infer<typeof ShowcasePlaybackVariantSchema>
export type ShowcasePlaybackManifest = z.infer<typeof ShowcasePlaybackManifestSchema>
export type ShowcaseEntryProjection = z.infer<typeof ShowcaseEntryProjectionSchema>
export type ShowcaseListQuery = z.infer<typeof ShowcaseListQuerySchema>
export type ShowcasePage = z.infer<typeof ShowcasePageSchema>
export type ShowcaseDetailResponse = z.infer<typeof ShowcaseDetailResponseSchema>
export type ShowcaseEngagementAction = z.infer<typeof ShowcaseEngagementActionSchema>
export type ShowcaseEngagementRequest = z.infer<typeof ShowcaseEngagementRequestSchema>
export type ShowcaseEngagementResponse = z.infer<typeof ShowcaseEngagementResponseSchema>
export type ShowcaseListResponse = z.infer<typeof ShowcaseListResponseSchema>
export type ShowcaseCloneResponse = z.infer<typeof ShowcaseCloneResponseSchema>
